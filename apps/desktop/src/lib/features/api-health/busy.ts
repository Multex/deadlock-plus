import { DeadlockApiError } from "@deadlock-plus/deadlock-api";

/**
 * Why a Deadlock API call failed. `busy` is the API turning requests away for now (429 rate limit or 503),
 * which a later retry fixes; `network` is no answer at all.
 */
export type ApiFailure =
    { kind: "busy"; retryAfterS: number | null } | { kind: "network" } | { kind: "error"; status: number | null };

const BUSY_STATUSES = new Set([429, 503]);
const BASE_DELAY_S = 10;
const MAX_DELAY_S = 300;

export function classifyApiFailure(e: unknown): ApiFailure {
    if (e instanceof DeadlockApiError) {
        return BUSY_STATUSES.has(e.status)
            ? { kind: "busy", retryAfterS: e.retryAfterS }
            : { kind: "error", status: e.status };
    }
    // `fetch` rejects with a TypeError when the connection cannot be made.
    if (e instanceof TypeError) return { kind: "network" };
    return { kind: "error", status: null };
}

/** Seconds before retry number `attempt` (0 first): the API's own wait, or longer as tries keep failing. */
export function retryDelayS(attempt: number, retryAfterS: number | null): number {
    const wait =
        attempt === 0 ? (retryAfterS ?? BASE_DELAY_S) : Math.max(retryAfterS ?? 0, BASE_DELAY_S * 2 ** attempt);
    return Math.min(MAX_DELAY_S, wait);
}

/** The wait a rate-limited body names, for calls that hand back the body instead of throwing. */
export function nextRequestIn(body: unknown): number | null {
    const raw = (body as { next_request_in?: unknown } | null)?.next_request_in;
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.ceil(raw) : null;
}
