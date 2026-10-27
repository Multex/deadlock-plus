import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    listen: vi.fn(async () => () => {}),
}));

import { getLiveMatch } from "./api";

const MATCH = {
    clockSecs: null,
    paused: false,
    matchMode: null,
    gameMode: null,
    perspective: "player",
    yourSide: null,
    teams: [{ side: "amber", souls: 0, players: [] }],
    queue: null,
};

describe("getLiveMatch shape check", () => {
    beforeEach(() => answers.clear());

    it.each([
        ["null", null],
        ["garbage", { garbage: true }],
        ["a team without players", { ...MATCH, teams: [{ side: "amber", souls: 0 }] }],
    ])("rejects %s", async (_, answer) => {
        answers.set("get_live_match", () => answer);
        await expect(getLiveMatch()).rejects.toBeDefined();
    });

    it("passes a good match through", async () => {
        answers.set("get_live_match", () => MATCH);
        await expect(getLiveMatch()).resolves.toEqual(MATCH);
    });
});
