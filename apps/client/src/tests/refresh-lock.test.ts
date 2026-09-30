import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Node 25 exposes a native `localStorage` that throws unless the process was
 * started with --localstorage-file, and it shadows jsdom's. The auth store is
 * created at import time and zustand's persist middleware writes to it
 * immediately, so install an in-memory Storage before importing the client.
 */
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  },
});

const { api } = await import("../services/api");

/**
 * H6: the refresh token rotates server-side and the httpOnly cookie is shared
 * by every tab on the origin, so a tab that refreshes while another is
 * mid-flight replays a spent token — the server's reuse detection then revokes
 * ALL sessions. The client must therefore hold a cross-tab Web Lock.
 *
 * The lock stub stands in for the browser API (jsdom ships none); the
 * assertions are about what the client does with it, not about the stub.
 */
describe("silent refresh cross-tab lock (H6)", () => {
  const LOCK_NAME = "jobtailor:silent-refresh";

  const refreshResponse = () => ({
    ok: true,
    json: async () => ({ data: { accessToken: "rotated-access-token" } }),
  });

  beforeEach(() => {
    Reflect.deleteProperty(navigator, "locks");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "locks");
    vi.unstubAllGlobals();
  });

  it("routes the refresh through a named cross-tab lock", async () => {
    const acquired: string[] = [];
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (name: string, cb: () => Promise<unknown>) => {
          acquired.push(name);
          return cb();
        },
      },
    });
    const fetchSpy = vi.fn(refreshResponse);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(api.trySilentRefresh()).resolves.toBe(true);

    expect(acquired).toEqual([LOCK_NAME]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not send a refresh while another tab holds the lock", async () => {
    let unlock!: () => void;
    const held = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (_name: string, cb: () => Promise<unknown>) => {
          await held;
          return cb();
        },
      },
    });
    const fetchSpy = vi.fn(refreshResponse);
    vi.stubGlobal("fetch", fetchSpy);

    const pending = api.trySilentRefresh();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).not.toHaveBeenCalled();

    unlock();
    await expect(pending).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still refreshes when the Web Locks API is unavailable", async () => {
    const fetchSpy = vi.fn(refreshResponse);
    vi.stubGlobal("fetch", fetchSpy);

    await expect(api.trySilentRefresh()).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("releases the in-tab mutex after a failed refresh so later calls retry", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, cb: () => Promise<unknown>) => cb(),
      },
    });
    const failing = vi.fn(async () => ({ ok: false }) as unknown as Response);
    vi.stubGlobal("fetch", failing);
    await expect(api.trySilentRefresh()).resolves.toBe(false);

    const working = vi.fn(refreshResponse);
    vi.stubGlobal("fetch", working);
    await expect(api.trySilentRefresh()).resolves.toBe(true);
    expect(working).toHaveBeenCalledTimes(1);
  });
});
