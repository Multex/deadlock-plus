import { en, interpolate, lookup, t, type Catalog } from "./i18n.svelte";

const GENERIC = "errors.common.internal";
const LOG_HINT = "Check the log for details.";

type AppError = { code: string; params?: Record<string, string> };

function isAppError(value: unknown): value is AppError {
    return typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string";
}

/** The code a failed command answered with, for the callers that treat one failure as a state of its own. */
export function errorCode(error: unknown): string | null {
    return isAppError(error) ? error.code : null;
}

/**
 * The text for a failed action: the command's own sentence when it tells the player something,
 * else `fallback`. A code whose English sentence only points at the log says no more than the
 * fallback, and raw strings and JavaScript errors are developer text, so those never show.
 */
export function failureText(error: unknown, fallback: string): string {
    if (!isAppError(error)) return fallback;
    const key = `errors.${error.code}`;
    const english = lookup(en, key);
    if (!english || english.endsWith(LOG_HINT)) return fallback;
    return t(key, error.params);
}

export function errorText(error: unknown, catalog?: Catalog): string {
    if (typeof error === "string") return error;
    const generic = () => (catalog ? (lookup(catalog, GENERIC) ?? GENERIC) : t(GENERIC));
    if (!isAppError(error)) return generic();
    const key = `errors.${error.code}`;
    if (catalog) {
        const template = lookup(catalog, key);
        return template ? interpolate(template, error.params) : generic();
    }
    const text = t(key, error.params);
    return text === key ? generic() : text;
}
