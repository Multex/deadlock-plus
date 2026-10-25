export interface AfterMatchDeps {
    /** False in every window but the main one. */
    mainWindow: boolean;
    enabled(): boolean;
    /** The main window is shown and has the focus. */
    attended(): boolean;
    /** Tosses the paper for `matchId`. */
    show(matchId: number): void;
    /** A later capture of a match already handled: refresh its paper in place. */
    update(matchId: number): void;
}

export interface AfterMatch {
    readonly pending: number | null;
    /** A `postgame-match` event. */
    captured(matchId: number): void;
    /** The window gained the focus or was shown. */
    attention(): void;
    /** The next match started. */
    matchStarted(): void;
}

export function createAfterMatch(deps: AfterMatchDeps): AfterMatch {
    let pending: number | null = null;
    const handled = new Set<number>();

    return {
        get pending() {
            return pending;
        },
        captured(matchId) {
            if (!deps.mainWindow || !deps.enabled()) return;
            if (handled.has(matchId)) {
                deps.update(matchId);
                return;
            }
            handled.add(matchId);
            if (deps.attended()) {
                pending = null;
                deps.show(matchId);
            } else {
                pending = matchId;
            }
        },
        attention() {
            if (pending === null) return;
            if (!deps.enabled()) {
                pending = null;
                return;
            }
            if (!deps.attended()) return;
            const matchId = pending;
            pending = null;
            deps.show(matchId);
        },
        matchStarted() {
            pending = null;
        },
    };
}
