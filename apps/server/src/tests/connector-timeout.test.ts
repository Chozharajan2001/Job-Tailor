import { describe, it, expect, afterAll, afterEach, vi } from "vitest";

/**
 * M7: every source connector calls fetch() with no signal and no deadline
 * (ashby.ts:27, greenhouse.ts:48/:67/:106, lever.ts:28, remoteok.ts:38). A
 * server that accepts the connection and never answers therefore hangs
 * pollSource forever: the poller's errorCount and circuit breaker only run on
 * a rejection, so a stalled connector keeps the whole poll batch open, the
 * GitHub Action sits until the runner kills it, and the source is never
 * broken. The missing piece is the deadline only — errorCount ($inc at
 * source-poller.service.ts:100/:142) and the breaker threshold already exist
 * and are already covered; they simply never get a chance to fire.
 *
 * CONNECTOR_TIMEOUT_MS is set small so the abort path is measured rather than
 * waited out, and connectorFetch must therefore read it per call, not cache it
 * at import.
 */

process.env.NODE_ENV = "test";
process.env.CONNECTOR_TIMEOUT_MS = "80";

const HANG = new Promise<Response>(() => undefined);

const { greenhouseConnector } =
  await import("../services/source-connectors/greenhouse.js");
const { ashbyConnector } =
  await import("../services/source-connectors/ashby.js");
const { leverConnector } =
  await import("../services/source-connectors/lever.js");
const { remoteokConnector } =
  await import("../services/source-connectors/remoteok.js");

interface Seen {
  url: string;
  signal?: AbortSignal;
}

/**
 * fetch stub: records the init each call received, then hangs — honouring the
 * signal the way real fetch does, so a connector that attaches a deadline gets
 * rejected and a connector that doesn't sits there until the test's own guard
 * fires. Without this abort race the stub would hang even when correctly
 * signalled, and the test would prove nothing about the production code.
 */
function stubHangFetch(handler?: (url: string) => Promise<Response>) {
  const seen: Seen[] = [];
  const fn = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const signal = init?.signal ?? undefined;
    seen.push({ url, signal });

    const body = handler
      ? handler(url)
      : new Promise<Response>(() => undefined);

    if (!signal) return body;

    return Promise.race([
      body,
      new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(signal.reason ?? new Error("aborted")),
          { once: true },
        );
      }),
    ]);
  };
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return seen;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

/**
 * Settle `promise` or report that it never did. Without a deadline the
 * connectors hang on the stubbed fetch, so a plain `await` would just burn the
 * vitest timeout instead of naming the cause.
 */
async function settleOrHang<T>(
  promise: Promise<T>,
  marker: string,
): Promise<
  { kind: "resolved"; value: T } | { kind: "rejected"; err: unknown }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    promise.then(
      (value) => ({ kind: "resolved" as const, value }),
      (err: unknown) => ({ kind: "rejected" as const, err }),
    ),
    new Promise<{ kind: "hung" }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "hung" }), 2_000);
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (outcome.kind === "hung") throw new Error(marker);
  return outcome;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The 80 ms deadline is this file's business only; a test file that runs after
// this one in the same worker must not inherit it.
afterAll(() => {
  delete process.env.CONNECTOR_TIMEOUT_MS;
});

describe("M7 connector requests carry a deadline", () => {
  it.each([
    ["ashby", ashbyConnector, "acme"],
    ["lever", leverConnector, "acme"],
    ["remoteok", remoteokConnector, "_"],
    ["greenhouse", greenhouseConnector, "acme"],
  ])("%s passes an AbortSignal to fetch", async (_name, connector, token) => {
    const seen = stubHangFetch();

    await settleOrHang(
      connector.fetchJobs(token),
      `${_name}: fetchJobs never settled — no deadline was attached`,
    );

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("aborts a hanging list request instead of waiting for it", async () => {
    stubHangFetch();

    const outcome = await settleOrHang(
      ashbyConnector.fetchJobs("acme"),
      "ashby: hanging fetch was never aborted",
    );

    expect(outcome.kind).toBe("rejected");
    const err = (outcome as { err: Error }).err;
    expect(err.name).toMatch(/AbortError|TimeoutError/);
  });

  it("bounds the per-job detail enrichment instead of leaving it open", async () => {
    // The list answers; every detail call hangs. greenhouse already treats a
    // failed detail as "skip this job, retry next poll" (the catch returns
    // null), so a bounded detail fetch must yield an empty feed quickly rather
    // than keeping the poll open.
    const seen = stubHangFetch((url) =>
      url.endsWith("/jobs")
        ? Promise.resolve(
            jsonResponse({
              jobs: [
                {
                  id: 1,
                  title: "Engineer",
                  absolute_url: "https://example.com/jobs/1",
                },
              ],
            }),
          )
        : HANG,
    );

    const outcome = await settleOrHang(
      greenhouseConnector.fetchJobs("acme"),
      "greenhouse: detail fetch never settled",
    );

    expect(outcome.kind).toBe("resolved");
    expect((outcome as { value: unknown[] }).value).toEqual([]);
    expect(seen.some((c) => c.url.endsWith("/jobs/1"))).toBe(true);
  });

  it("reads the deadline per call so a deploy can retune it", async () => {
    const { connectorTimeoutMs } = await import("../utils/connector-fetch.js");

    expect(connectorTimeoutMs()).toBe(80);
    process.env.CONNECTOR_TIMEOUT_MS = "1500";
    expect(connectorTimeoutMs()).toBe(1500);
    process.env.CONNECTOR_TIMEOUT_MS = "not-a-number";
    expect(connectorTimeoutMs()).toBe(10_000);
    process.env.CONNECTOR_TIMEOUT_MS = "0";
    expect(connectorTimeoutMs()).toBe(10_000);
    delete process.env.CONNECTOR_TIMEOUT_MS;
    expect(connectorTimeoutMs()).toBe(10_000);
    process.env.CONNECTOR_TIMEOUT_MS = "80";
  });
});
