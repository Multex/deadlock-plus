import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.() ?? null),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { glanceValue } from "./home";
import { loadGlance, type GlanceSummary } from "./glance";

const empty = (): GlanceSummary => ({ blocked: null, mutes: null, replays: null });

describe("loadGlance", () => {
    beforeEach(() => answers.clear());

    it("settles with every tile empty when each command answers null", async () => {
        const summary = empty();
        await expect(loadGlance(summary)).resolves.toBeUndefined();
        expect([summary.blocked, summary.mutes, summary.replays].map(glanceValue)).toEqual(["–", "–", "–"]);
    });

    it("settles with the mutes tile empty when the voice ban file is not a voice ban", async () => {
        answers.set("read_voice_ban", () => ({ path: "x", exists: false, text: "", gameRunning: false }));
        answers.set("list_demos", () => ({ demos: [{}, {}], dir: "d" }));
        const summary = empty();
        await expect(loadGlance(summary)).resolves.toBeUndefined();
        expect(glanceValue(summary.mutes)).toBe("–");
    });
});
