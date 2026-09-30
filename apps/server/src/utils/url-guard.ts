import dns from "dns";
import net from "net";
import http from "node:http";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * SSRF guard — validates that a URL points at a public, safe destination
 * before the server makes an outbound request to it.
 *
 * Rules:
 * - Only http: / https: schemes allowed
 * - Hostname must not be localhost / .local / .internal
 * - DNS-resolved addresses must not be loopback, private, link-local, or reserved
 *
 * Call this right before every outbound fetch of user-influenced URLs.
 */

const BLOCKED_HOST_SUFFIXES = [".local", ".internal"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

/**
 * Check whether an IPv4 address falls into a non-public range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed => block

  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8 "this" network
    a === 10 || // 10.0.0.0/8 private
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (incl. cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 0 && parts[2] === 0) || // 192.0.0.0/24 IETF
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    a >= 224 // multicast + reserved (224.0.0.0/4, 240.0.0.0/4)
  );
}

/**
 * Check whether an IPv6 address falls into a non-public range.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // Strip zone id (fe80::1%eth0)
  const bare = normalized.split("%")[0];
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const v4Mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);

  return (
    bare === "::" || // unspecified
    bare === "::1" || // loopback
    bare.startsWith("fc") || // fc00::/7 unique local (fc/fd)
    bare.startsWith("fd") ||
    bare.startsWith("fe8") || // fe80::/10 link-local
    bare.startsWith("fe9") ||
    bare.startsWith("fea") ||
    bare.startsWith("feb") ||
    bare.startsWith("::ffff:") // any IPv4-mapped not already matched is suspicious
  );
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unparseable => block
}

export interface SafeTarget {
  parsed: URL;
  /**
   * The exact addresses that passed validation. The caller must connect using
   * only these (see createPinnedLookup); re-resolving the hostname at connect
   * time is the DNS-rebinding window this closes.
   */
  addresses: string[];
}

/**
 * Validate a URL for safe server-side fetching and return the addresses that
 * passed. Throws when the URL is unsafe.
 */
export async function resolveSafeTarget(urlStr: string): Promise<SafeTarget> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL provided.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `URL scheme "${parsed.protocol}" is not allowed (http/https only).`,
    );
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  const lowerHost = hostname.toLowerCase();

  if (
    BLOCKED_HOSTNAMES.has(lowerHost) ||
    BLOCKED_HOST_SUFFIXES.some((s) => lowerHost.endsWith(s))
  ) {
    throw new Error("URL points to a blocked internal host.");
  }

  // Literal IP addresses are checked directly
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("URL points to a private/internal address.");
    }
    return { parsed, addresses: [hostname] };
  }

  // Resolve DNS and check every returned address (A + AAAA)
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve URL hostname.");
  }

  if (addresses.length === 0) {
    throw new Error("Could not resolve URL hostname.");
  }

  for (const record of addresses) {
    if (isPrivateAddress(record.address)) {
      throw new Error("URL resolves to a private/internal address.");
    }
  }

  return { parsed, addresses: addresses.map((r) => r.address) };
}

/**
 * Validate a URL for safe server-side fetching.
 * Throws an Error with a descriptive message when the URL is unsafe.
 * Returns the parsed URL on success.
 */
export async function assertSafePublicUrl(urlStr: string): Promise<URL> {
  const { parsed } = await resolveSafeTarget(urlStr);
  return parsed;
}

export interface SafeFetchOptions {
  /** Max redirects to follow, re-validating each hop (default 3) */
  maxRedirects?: number;
  /** Request timeout in ms (default 10000) */
  timeoutMs?: number;
  /** Max response body size in bytes (default 2 MB) */
  maxBytes?: number;
  /** Optional extra headers */
  headers?: Record<string, string>;
  /** When true, non-2xx responses are returned (not thrown) — for link checks */
  allowNonOk?: boolean;
  /** When true, the body is not read (HEAD-style status checks only) */
  skipBody?: boolean;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface PinnedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Servers ignore `Accept-Encoding: identity` often enough that decoding stays required. */
function decodeBody(body: Buffer, encoding: string | null): Buffer {
  if (!encoding || body.length === 0) return body;
  const kind = encoding.toLowerCase();
  try {
    if (kind.includes("gzip")) return gunzipSync(body);
    if (kind.includes("br")) return brotliDecompressSync(body);
    if (kind.includes("deflate")) return inflateSync(body);
  } catch {
    return body;
  }
  return body;
}

/**
 * Issue one request, dialed only at the addresses that already passed
 * validation. Deliberately not fetch(): the built-in client cannot be told
 * which IP to connect to, which is precisely the gap a rebinding DNS answer
 * walks through between validation and connect.
 */
function pinnedRequest(
  target: URL,
  addresses: readonly string[],
  options: {
    headers: Record<string, string>;
    timeoutMs: number;
    maxBytes: number;
  },
): Promise<PinnedResponse> {
  const isHttps = target.protocol === "https:";
  const lib = isHttps ? https : http;
  const hostname = target.hostname.replace(/^\[|\]$/g, "");

  return new Promise((resolve, reject) => {
    const req = lib.request(
      target.toString(),
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Encoding": "gzip, deflate, br",
          ...options.headers,
        },
        ...(isHttps ? { servername: hostname } : {}),
        lookup: createPinnedLookup(
          addresses,
        ) as unknown as https.RequestOptions["lookup"],
        timeout: options.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          received += buf.length;
          if (received > options.maxBytes) {
            req.destroy(new Error("URL response exceeded the size limit."));
            return;
          }
          chunks.push(buf);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: res.headers as Record<
              string,
              string | string[] | undefined
            >,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${options.timeoutMs}ms.`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetch a URL safely: SSRF-validated, redirect-revalidated, timeout-bounded,
 * and response-size-capped. Returns the body text and final URL.
 */
export async function safeFetchText(
  urlStr: string,
  options: SafeFetchOptions = {},
): Promise<{ body: string; finalUrl: string; status: number }> {
  const {
    maxRedirects = 3,
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    headers = {},
    allowNonOk = false,
    skipBody = false,
  } = options;

  let currentUrl = urlStr;
  let redirects = 0;
  let result: PinnedResponse | undefined;

  // Follow redirects manually so every hop is re-validated AND re-pinned:
  // the address set of hop N must never be reused for hop N+1.
  for (;;) {
    const target = new URL(currentUrl);
    const { addresses } = await resolveSafeTarget(currentUrl);

    result = await pinnedRequest(target, addresses, {
      headers,
      timeoutMs,
      maxBytes,
    });

    const location = pickHeader(result.headers, "location");
    const isRedirect =
      result.status >= 300 && result.status < 400 && !!location;
    if (!isRedirect) break;

    redirects += 1;
    if (redirects > maxRedirects) {
      throw new Error("Too many redirects while fetching URL.");
    }
    currentUrl = new URL(location as string, currentUrl).toString();
  }

  const ok = result.status >= 200 && result.status < 300;
  if (!ok && !allowNonOk) {
    throw new Error(
      `Failed to fetch URL: ${result.statusText || "unknown error"} (${result.status})`,
    );
  }

  if (skipBody || !ok) {
    return { body: "", finalUrl: currentUrl, status: result.status };
  }

  return {
    body: decodeBody(
      result.body,
      pickHeader(result.headers, "content-encoding"),
    ).toString("utf-8"),
    finalUrl: currentUrl,
    status: result.status,
  };
}

export type PinnedLookup = (
  hostname: string,
  options: unknown,
  callback: (
    err: Error | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => void;

/**
 * A `lookup` implementation that never consults DNS: it can only answer with
 * the addresses that already passed validation. Hand it to Node's http/https
 * request (or an undici Agent) so the connection cannot be steered elsewhere
 * between validation and connect — the DNS-rebinding window.
 *
 * Build one per hop. An empty set is rejected rather than falling back to
 * resolution, so a redirect that forgets to re-pin fails closed.
 */
export function createPinnedLookup(addresses: readonly string[]): PinnedLookup {
  const records = addresses.map((address) => ({
    address,
    family: net.isIPv6(address) ? 6 : 4,
  }));
  const offending = addresses.filter(
    (ip) => !net.isIP(ip) || isPrivateAddress(ip),
  );

  return (_hostname, options, callback) => {
    if (offending.length > 0) {
      callback(new Error(`Pinned address not allowed: ${offending[0]}`), []);
      return;
    }
    if (records.length === 0) {
      callback(new Error("No validated address pinned for this host."), []);
      return;
    }

    if ((options as { all?: boolean } | undefined)?.all) {
      callback(null, records);
      return;
    }
    const first = records[0];
    callback(null, first.address, first.family);
  };
}
