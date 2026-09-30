import { describe, it, expect, vi } from "vitest";
import { createPinnedLookup } from "../utils/url-guard.js";

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
