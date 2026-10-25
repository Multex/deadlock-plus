import type { RowMode } from "@deadlock-plus/match/list";

export type FrontPageModes = Record<RowMode, boolean>;

/** The order the mode chips are laid out in. */
export const FRONT_PAGE_MODES: readonly RowMode[] = ["ranked", "unranked", "streetBrawl", "bot", "custom", "other"];

/** Player matches get a paper; bot matches and custom lobbies are practice, so they do not by default. */
export const DEFAULT_FRONT_PAGE_MODES: Readonly<FrontPageModes> = {
    ranked: true,
    unranked: true,
    streetBrawl: true,
    bot: false,
    custom: false,
    other: true,
};

export function resolveFrontPageModes(stored: unknown): FrontPageModes {
    const source = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
    return Object.fromEntries(
        FRONT_PAGE_MODES.map((mode) => {
            const value = source[mode];
            return [mode, typeof value === "boolean" ? value : DEFAULT_FRONT_PAGE_MODES[mode]];
        }),
    ) as FrontPageModes;
}

/** Only what differs from the defaults is stored, so a later change of default reaches everyone who kept it. */
export function frontPageModeChanges(modes: FrontPageModes): Partial<FrontPageModes> {
    return Object.fromEntries(
        FRONT_PAGE_MODES.filter((mode) => modes[mode] !== DEFAULT_FRONT_PAGE_MODES[mode]).map((mode) => [
            mode,
            modes[mode],
        ]),
    );
}
