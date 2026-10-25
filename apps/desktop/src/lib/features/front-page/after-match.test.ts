import { describe, expect, it } from "vitest";
import { createAfterMatch, type AfterMatchDeps } from "./after-match";

function setup(options: Partial<{ mainWindow: boolean; enabled: boolean; attended: boolean }> = {}) {
    const state = { enabled: options.enabled ?? true, attended: options.attended ?? true };
    const log: string[] = [];
    const deps: AfterMatchDeps = {
        mainWindow: options.mainWindow ?? true,
        enabled: () => state.enabled,
        attended: () => state.attended,
        show: (id) => log.push(`show ${id}`),
        update: (id) => log.push(`update ${id}`),
    };
    return { afterMatch: createAfterMatch(deps), log, state };
}

describe("createAfterMatch", () => {
    it("tosses the paper at once while the window has the focus", () => {
        const { afterMatch, log } = setup();
        afterMatch.captured(7);
        expect(log).toEqual(["show 7"]);
        expect(afterMatch.pending).toBeNull();
    });

    it("keeps the paper pending while the window is away and tosses it on the next focus", () => {
        const { afterMatch, log, state } = setup({ attended: false });
        afterMatch.captured(7);
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBe(7);

        afterMatch.attention();
        expect(log).toEqual([]);

        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["show 7"]);
        expect(afterMatch.pending).toBeNull();

        afterMatch.attention();
        expect(log).toEqual(["show 7"]);
    });

    it("updates the paper in place when the same match is captured again", () => {
        const { afterMatch, log } = setup();
        afterMatch.captured(7);
        afterMatch.captured(7);
        expect(log).toEqual(["show 7", "update 7"]);
    });

    it("tosses once for a match captured twice while away", () => {
        const { afterMatch, log, state } = setup({ attended: false });
        afterMatch.captured(7);
        afterMatch.captured(7);
        state.attended = true;
        afterMatch.attention();
        expect(log.filter((l) => l.startsWith("show"))).toEqual(["show 7"]);
    });

    it("drops a pending paper when the next match starts", () => {
        const { afterMatch, log, state } = setup({ attended: false });
        afterMatch.captured(7);
        afterMatch.matchStarted();
        expect(afterMatch.pending).toBeNull();
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual([]);
    });

    it("keeps only the newest match pending", () => {
        const { afterMatch, log, state } = setup({ attended: false });
        afterMatch.captured(7);
        afterMatch.captured(8);
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual(["show 8"]);
    });

    it("shows nothing with the setting off", () => {
        const { afterMatch, log } = setup({ enabled: false });
        afterMatch.captured(7);
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
    });

    it("drops a pending paper when the setting is turned off before the window comes back", () => {
        const { afterMatch, log, state } = setup({ attended: false });
        afterMatch.captured(7);
        state.enabled = false;
        state.attended = true;
        afterMatch.attention();
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
    });

    it("does nothing outside the main window", () => {
        const { afterMatch, log } = setup({ mainWindow: false });
        afterMatch.captured(7);
        afterMatch.attention();
        expect(log).toEqual([]);
        expect(afterMatch.pending).toBeNull();
    });
});
