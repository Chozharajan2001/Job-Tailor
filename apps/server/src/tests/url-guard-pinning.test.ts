import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dns from "node:dns";
import { createPinnedLookup, safeFetchText } from "../utils/url-guard.js";

/**
 * H8: safeFetchText must hand the connection a lookup that can only answer
 * with the addresses that passed validation, and must keep SNI on the original
 * hostname. node:https is stubbed so we can read the options the guard passes
 * down — that is the whole attack surface.
 */
const httpsStub = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; options: Record<string, unknown> }>,
  respond: {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "hello",
  },
  /** Per-hop responses for redirect scenarios; falls back to `respond`. */
  queue: [] as Array<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>,
}));

vi.mock("node:https", async () => {
  const { Readable } = await import("node:stream");
  return {
    default: {
      request: (
        url: string,
        options: Record<string, unknown>,
        cb: (res: unknown) => void,
      ) => {
        httpsStub.calls.push({ url, options });
        const next = httpsStub.queue.shift() ?? httpsStub.respond;
        const res = Object.assign(Readable.from([next.body]), {
          statusCode: next.statusCode,
          headers: next.headers,
        });
        setTimeout(() => cb(res), 0);
        return {
          on: () => undefined,
          setTimeout: () => undefined,
          write: () => undefined,
          end: () => undefined,
          destroy: () => undefined,
        };
      },
    },
  };
});

const publicAnswer = (address: string) => [{ address, family: 4 }];

describe("safeFetchText pinned connection (H8)", () => {
  beforeEach(() => {
    httpsStub.calls.length = 0;
    httpsStub.queue.length = 0;
    httpsStub.respond = { statusCode: 200, headers: {}, body: "hello" };
    vi.spyOn(dns.promises, "lookup").mockImplementation(async (_h, opts) =>
      opts && (opts as { all?: boolean }).all
        ? publicAnswer("203.0.113.10")
        : { address: "203.0.113.10", family: 4 },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const lookupOf = (index: number) =>
    httpsStub.calls[index].options.lookup as (
      host: string,
      opts: unknown,
      cb: (err: Error | null, addr: unknown, family?: number) => void,
    ) => void;

  it("connects through a lookup that can only return the validated address", async () => {
    await safeFetchText("https://victim.example/job/1");

    expect(httpsStub.calls).toHaveLength(1);
    const cb = vi.fn();
    lookupOf(0)("victim.example", { all: true }, cb);
    expect(cb.mock.calls[0][0]).toBeNull();
    expect(cb.mock.calls[0][1]).toEqual([
      { address: "203.0.113.10", family: 4 },
    ]);

    // A second, hostile DNS answer cannot reach the socket: the lookup never
    // consults DNS again.
    (dns.promises.lookup as ReturnType<typeof vi.fn>).mockImplementation(
      async () => publicAnswer("127.0.0.1"),
    );
    const after = vi.fn();
    lookupOf(0)("victim.example", { all: true }, after);
    expect(after.mock.calls[0][1]).toEqual([
      { address: "203.0.113.10", family: 4 },
    ]);
  });

  it("keeps TLS servername on the original hostname", async () => {
    await safeFetchText("https://victim.example/job/1");
    expect(httpsStub.calls[0].options.servername).toBe("victim.example");
    expect(httpsStub.calls[0].url).toContain("victim.example");
  });

  it("re-pins for a redirect instead of reusing the first hop", async () => {
    httpsStub.queue.push(
      {
        statusCode: 302,
        headers: { location: "https://other.example/final" },
        body: "",
      },
      { statusCode: 200, headers: {}, body: "landed" },
    );
    (dns.promises.lookup as ReturnType<typeof vi.fn>).mockImplementation(
      async (host: string, opts: unknown) =>
        opts && (opts as { all?: boolean }).all
          ? host === "other.example"
            ? publicAnswer("198.51.100.7")
            : publicAnswer("203.0.113.10")
          : { address: "203.0.113.10", family: 4 },
    );

    const result = await safeFetchText("https://victim.example/start");

    expect(httpsStub.calls).toHaveLength(2);
    expect(result.finalUrl).toContain("other.example");
    const cb = vi.fn();
    lookupOf(1)("other.example", { all: true }, cb);
    expect(cb.mock.calls[0][1]).toEqual([
      { address: "198.51.100.7", family: 4 },
    ]);
  });

  it("never opens a socket when the hop resolves to a private address", async () => {
    (dns.promises.lookup as ReturnType<typeof vi.fn>).mockImplementation(
      async () => publicAnswer("127.0.0.1"),
    );

    await expect(safeFetchText("https://rebind.example/")).rejects.toThrow(
      /private\/internal/i,
    );
    expect(httpsStub.calls).toHaveLength(0);
  });

  it("returns the body and status for a plain 200", async () => {
    const result = await safeFetchText("https://victim.example/job/2");
    expect(result.status).toBe(200);
    expect(result.body).toContain("hello");
  });
});

/**
 * H8 core: the guard already resolves and validates every address a hostname
 * maps to. The connection must then be forced to use exactly that answer, so a
 * second DNS response (the rebinding trick) can never steer it to a private
 * address. These tests pin the lookup contract itself — the transport wiring
 * feeds it the validated records and nothing else.
 */
describe("createPinnedLookup (H8)", () => {
  it("answers from the pinned set only, never from DNS", async () => {
    const lookup = createPinnedLookup(["203.0.113.10", "2001:db8::1"]);
    const cb = vi.fn();

    lookup("attacker.example", { all: true }, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const [err, records] = cb.mock.calls[0] as [
      Error | null,
      Array<{ address: string; family: number }>,
    ];
    expect(err).toBeNull();
    expect(records).toEqual([
      { address: "203.0.113.10", family: 4 },
      { address: "2001:db8::1", family: 6 },
    ]);
  });

  it("supports the single-record form Node uses by default", () => {
    const lookup = createPinnedLookup(["203.0.113.10"]);
    const cb = vi.fn();

    lookup("attacker.example", {}, cb);

    const [err, address, family] = cb.mock.calls[0] as [
      Error | null,
      string,
      number,
    ];
    expect(err).toBeNull();
    expect(address).toBe("203.0.113.10");
    expect(family).toBe(4);
  });

  it("rejects when nothing was pinned, so a redirect cannot reuse another hop's pin", () => {
    const lookup = createPinnedLookup([]);
    const cb = vi.fn();

    lookup("elsewhere.example", { all: true }, cb);

    const [err] = cb.mock.calls[0] as [Error | null];
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/no validated address/i);
  });

  it("refuses a private address slipped into the pinned set", () => {
    const lookup = createPinnedLookup(["127.0.0.1"]);
    const cb = vi.fn();

    lookup("rebind.example", { all: true }, cb);

    const [err] = cb.mock.calls[0] as [Error | null];
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/private|not allowed/i);
  });
});
