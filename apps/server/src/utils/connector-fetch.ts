/**
 * Every source connector talks to a third-party career API that can accept the
 * connection and then never answer. Those calls go through here so each one
 * carries a deadline: without it `pollSource` stays open forever, and the
 * poller's errorCount and circuit breaker — which only run on a rejection —
 * never get to fire.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** Read per call, so a deploy can retune without a code change. */
export function connectorTimeoutMs(): number {
  const parsed = Number(process.env.CONNECTOR_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function connectorFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(connectorTimeoutMs()),
  });
}
