const DASH = /\s*[\u2013\u2014~\uFF5E-]\s*/;

/**
 * `formatRange` joins its ends with an en dash, and Dispatch prints no dashes: the separator becomes `join`
 * ("Oct 5 to 11, 2026") and the locale's shared parts stay as `Intl` laid them out.
 */
export function dateRange(format: Intl.DateTimeFormat, fromMs: number, toMs: number, join: string): string {
    let joined = false;
    return format
        .formatRangeToParts(fromMs, toMs)
        .map((p) => {
            if (joined || p.type !== "literal" || p.source !== "shared" || !DASH.test(p.value)) return p.value;
            joined = true;
            return p.value.replace(DASH, ` ${join} `);
        })
        .join("");
}
