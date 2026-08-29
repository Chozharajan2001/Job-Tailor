import dns from "dns";
import net from "net";

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

/**
 * Validate a URL for safe server-side fetching.
 * Throws an Error with a descriptive message when the URL is unsafe.
 * Returns the parsed URL on success.
 */
export async function assertSafePublicUrl(urlStr: string): Promise<URL> {
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
    return parsed;
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
  let response: Response | undefined;

  // Follow redirects manually so every hop passes the SSRF guard
  for (;;) {
    await assertSafePublicUrl(currentUrl);

    response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...headers,
      },
    });

    const location =
      typeof response.headers?.get === "function"
        ? response.headers.get("location")
        : null;
    const isRedirect =
      response.status >= 300 && response.status < 400 && !!location;
    if (!isRedirect) break;

    redirects += 1;
    if (redirects > maxRedirects) {
      throw new Error("Too many redirects while fetching URL.");
    }
    currentUrl = new URL(location as string, currentUrl).toString();
  }

  if (!response || (!response.ok && !allowNonOk)) {
    throw new Error(
      `Failed to fetch URL: ${response?.statusText ?? "unknown error"} (${response?.status ?? 0})`,
    );
  }

  const finalUrl = response.url || currentUrl;
  if (skipBody || !response.ok) {
    // Status-only result (link checks); release the body without reading it
    await response.body?.cancel?.();
    return { body: "", finalUrl, status: response.status };
  }

  // Stream-cap the body to avoid memory exhaustion from huge responses.
  // Falls back to response.text() when no readable stream is exposed
  // (also keeps simple fetch mocks working in tests).
  const reader = response.body?.getReader?.();
  if (!reader) {
    const body =
      typeof response.text === "function" ? await response.text() : "";
    if (body.length > maxBytes) {
      throw new Error("URL response exceeded the size limit.");
    }
    return { body, finalUrl, status: response.status };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        throw new Error("URL response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks).toString("utf-8");
  return { body, finalUrl, status: response.status };
}
