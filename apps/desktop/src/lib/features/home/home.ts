import { t, tn } from "$lib/core/i18n.svelte";

export type Period = "lateNight" | "earlyMorning" | "morning" | "midday" | "afternoon" | "evening" | "night";

const GREETING_COUNTS: Record<Period, number> = {
    lateNight: 5,
    earlyMorning: 4,
    morning: 5,
    midday: 4,
    afternoon: 5,
    evening: 5,
    night: 5,
};

const PERIOD_KEYS: Record<Period, string> = {
    lateNight: "late_night",
    earlyMorning: "early_morning",
    morning: "morning",
    midday: "midday",
    afternoon: "afternoon",
    evening: "evening",
    night: "night",
};

/**
 * Catalog keys per period: `home.greetings.<period>.<n>` takes `{name}`, and
 * `home.greetings_nameless.<period>.<n>` is the same line worded for a missing name.
 */
export const GREETINGS: Record<Period, string[]> = Object.fromEntries(
    (Object.keys(GREETING_COUNTS) as Period[]).map((period) => [
        period,
        Array.from({ length: GREETING_COUNTS[period] }, (_, i) => `${PERIOD_KEYS[period]}.${i + 1}`),
    ]),
) as Record<Period, string[]>;

export function periodFor(hour: number): Period {
    if (hour < 5) return "lateNight";
    if (hour < 8) return "earlyMorning";
    if (hour < 12) return "morning";
    if (hour < 14) return "midday";
    if (hour < 18) return "afternoon";
    if (hour < 22) return "evening";
    return "night";
}

export function greeting(hour: number, name: string | null, seed: number): string {
    const options = GREETINGS[periodFor(hour)];
    const id = options[seed % options.length];
    return name ? t(`home.greetings.${id}`, { name }) : t(`home.greetings_nameless.${id}`);
}

/** Chosen once per app session so the greeting does not change on every visit to Home. */
export const sessionSeed = Math.floor(Math.random() * 1_000_000);

/** Calendar-day label in local time, so a match at 23:50 last night is "Yesterday", not "Today". */
export function relativeDay(thenS: number, nowS: number): string {
    const startOfDay = (s: number) => {
        const d = new Date(s * 1000);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const days = Math.round((startOfDay(nowS) - startOfDay(thenS)) / 86_400_000);
    if (days <= 0) return t("home.today");
    if (days === 1) return t("home.yesterday");
    return tn("home.days_ago", days);
}

export function isActivePath(pathname: string, href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);

export function gameTile(running: boolean | null): { label: string; launchable: boolean } {
    return running
        ? { label: t("home.game.running"), launchable: false }
        : { label: t("home.game.launch"), launchable: true };
}

export const glanceValue = (n: number | null) => (n === null ? "–" : String(n));

/**
 * What an empty stats card says, by how far loading got. Without a Steam account there is nothing to load.
 * `busy` is the API-busy line while the API turns the history away, which outranks the load state.
 */
export function statsNote(status: string, emptyText: string, noAccount = false, busy: string | null = null): string {
    if (noAccount) return t("account.none_found");
    if (status === "ready") return emptyText;
    if (busy !== null) return busy;
    return status === "error" ? t("home.stats_error") : t("home.stats_loading");
}
