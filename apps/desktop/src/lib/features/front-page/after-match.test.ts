import { describe, expect, it } from "vitest";
import type { RowMode } from "@deadlock-plus/match/list";
import { createAfterMatch, type AfterMatchDeps } from "./after-match";

function setup(options: Partial<{ mainWindow: boolean; enabled: boolean; attended: boolean }> = {}) {
    const state = {
        enabled: options.enabled ?? true,
        attended: options.attended ?? true,
        skipped: new Set<RowMode>(),
    };
    const log: string[] = [];
    const deps: AfterMatchDeps = {
        mainWindow: options.mainWindow ?? true,
        enabled: (mode) => state.enabled && !state.skipped.has(mode),
        attended: () => state.attended,
        show: (id) => log.push(`show ${id}`),
        update: (id) => log.push(`update ${id}`),
        waiting: (id) => log.push(`waiting ${id}`),
    };
    const afterMatch = createAfterMatch(deps);
    const captured = (id: number, mode: RowMode = "ranked") => afterMatch.captured(id, mode);
    return { afterMatch, captured, log, state };
}

describe("createAfterMatch", () => {
    it("tosses the paper at once while the window has the focus", () => {
        const { afterMatch, captured, log } = setup();
        captured(7);
        expect(log).toEqual(["show 7"]);
        expect(afterMatch.pending).toBeNull();
    });

    it("keeps the paper pending while the window is away and tosses it on the next focus", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7);
        expect(log).toEqual(["waiting 7"]);
        expect(afterMatch.pending).toBe(7);

        afterMatch.attention();
        expect(log).toEqual(["waiting 7"]);

        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["waiting 7", "show 7"]);
        expect(afterMatch.pending).toBeNull();

        afterMatch.attention();
        expect(log).toEqual(["waiting 7", "show 7"]);
    });

    it("updates the paper in place when the same match is captured again", () => {
        const { afterMatch, captured, log } = setup();
        captured(7);
        captured(7);
        expect(log).toEqual(["show 7", "update 7"]);
    });

    it("tosses once and tells the overlay once for a match captured twice while away", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7);
        captured(7);
        state.attended = true;
        afterMatch.attention();
        expect(log.filter((l) => !l.startsWith("update"))).toEqual(["waiting 7", "show 7"]);
    });

    it("does not tell the overlay about a paper that lands at once", () => {
        const { captured, log } = setup();
        captured(7);
        expect(log).toEqual(["show 7"]);
    });

    it("shows nothing for a match of a mode that is switched off", () => {
        const { afterMatch, captured, log, state } = setup();
        state.skipped.add("bot");
        captured(7, "bot");
        expect(log).toEqual([]);
        state.attended = false;
        captured(8, "bot");
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
        captured(9, "unranked");
        expect(log).toEqual(["waiting 9"]);
    });

    it("drops a pending paper whose mode was switched off before the window came back", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7, "streetBrawl");
        state.skipped.add("streetBrawl");
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["waiting 7"]);
        expect(afterMatch.pending).toBeNull();
    });

    it("drops a pending paper when the next match starts", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7);
        afterMatch.matchStarted();
        expect(afterMatch.pending).toBeNull();
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["waiting 7"]);
    });

    it("keeps only the newest match pending", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7);
        captured(8);
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["waiting 7", "waiting 8", "show 8"]);
    });

    it("shows nothing with the setting off", () => {
        const { afterMatch, captured, log } = setup({ enabled: false });
        captured(7);
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
    });

    it("drops a pending paper when the setting is turned off before the window comes back", () => {
        const { afterMatch, captured, log, state } = setup({ attended: false });
        captured(7);
        state.enabled = false;
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["waiting 7"]);
        expect(afterMatch.pending).toBeNull();
    });

    it("does nothing outside the main window", () => {
        const { afterMatch, captured, log } = setup({ mainWindow: false });
        captured(7);
        afterMatch.attention();
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
    });
});
