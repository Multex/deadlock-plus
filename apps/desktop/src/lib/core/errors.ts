import { interpolate, lookup, t, type Catalog } from "./i18n.svelte";

const GENERIC = "errors.common.internal";

function isAppError(value: unknown): value is { code: string; params?: Record<string, string> } {
    return typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string";
}

/** The code a failed command answered with, for the callers that treat one failure as a state of its own. */
export function errorCode(error: unknown): string | null {
    return isAppError(error) ? error.code : null;
}

export function errorText(error: unknown, catalog?: Catalog): string {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
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
