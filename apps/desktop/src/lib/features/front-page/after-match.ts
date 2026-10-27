import type { RowMode } from "@deadlock-plus/match/list";

export interface AfterMatchDeps {
    /** False in every window but the main one. */
    mainWindow: boolean;
    /** The after-match paper is switched on for matches of `mode`. */
    enabled(mode: RowMode): boolean;
    /** The main window is shown and has the focus. */
    attended(): boolean;
    /** Another dialog is open. Two modals would share one Escape and fight over Tab, so the paper waits. */
    covered(): boolean;
    /** Tosses the paper for `matchId`. */
    show(matchId: number): void;
    /** A later capture of a match already handled: refresh its paper in place. */
    update(matchId: number): void;
    /** The paper for `matchId` waits for the window; said once per match. */
    waiting(matchId: number): void;
}

export interface AfterMatch {
    readonly pending: number | null;
    /** A `postgame-match` event. */
    captured(matchId: number, mode: RowMode): void;
    /** The window gained the focus or was shown, or the last open dialog closed. */
    attention(): void;
    /** The next match started. */
    matchStarted(): void;
}

export function createAfterMatch(deps: AfterMatchDeps): AfterMatch {
    let pending: { matchId: number; mode: RowMode } | null = null;
    const handled = new Set<number>();

    return {
        get pending() {
            return pending?.matchId ?? null;
        },
        captured(matchId, mode) {
            if (!deps.mainWindow || !deps.enabled(mode)) return;
            if (handled.has(matchId)) {
                deps.update(matchId);
                return;
            }
            handled.add(matchId);
            if (deps.attended() && !deps.covered()) {
                pending = null;
                deps.show(matchId);
                return;
            }
            pending = { matchId, mode };
            if (!deps.attended()) deps.waiting(matchId);
        },
        attention() {
            if (pending === null) return;
            if (!deps.enabled(pending.mode)) {
                pending = null;
                return;
            }
            if (!deps.attended() || deps.covered()) return;
            const { matchId } = pending;
            pending = null;
            deps.show(matchId);
        },
        matchStarted() {
            pending = null;
        },
    };
}

export interface AfterMatchEnv {
    mainWindow: boolean;
    /** Read on each call, so a switch flipped while a paper waits takes effect. */
    settings: {
        frontPageAfterMatch: boolean;
        frontPageModes: Record<RowMode, boolean>;
        frontPageOverlayAlert: boolean;
    };
    hasFocus(): boolean;
    isHidden(): boolean;
    dialogOpen(): boolean;
    notifyWaiting(): Promise<unknown>;
}

export function afterMatchDeps(env: AfterMatchEnv, paper: Pick<AfterMatchDeps, "show" | "update">): AfterMatchDeps {
    return {
        mainWindow: env.mainWindow,
        enabled: (mode) => env.settings.frontPageAfterMatch && env.settings.frontPageModes[mode],
        attended: () => env.hasFocus() && !env.isHidden(),
        covered: () => env.dialogOpen(),
        waiting: () => {
            if (env.settings.frontPageOverlayAlert) env.notifyWaiting().catch(() => {});
        },
        ...paper,
    };
}
