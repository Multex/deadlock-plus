import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { getAppInfo, nextMaintenance, overlayStatus } from "./api";

describe("settings api shape checks", () => {
    beforeEach(() => answers.clear());

    it("overlayStatus rejects a null answer", async () => {
        answers.set("overlay_status", () => null);
        await expect(overlayStatus()).rejects.toBeDefined();
    });

    it("overlayStatus rejects an answer without the flags", async () => {
        answers.set("overlay_status", () => ({}));
        await expect(overlayStatus()).rejects.toBeDefined();
    });

    it("overlayStatus passes a good answer through", async () => {
        const status = { gameOpen: true, exclusiveFullscreen: false };
        answers.set("overlay_status", () => status);
        await expect(overlayStatus()).resolves.toEqual(status);
    });

    it("getAppInfo rejects a null answer", async () => {
        answers.set("app_info", () => null);
        await expect(getAppInfo()).rejects.toBeDefined();
    });

    it.each([
        ["null", null],
        ["an object", { garbage: true }],
        ["NaN", Number.NaN],
    ])("nextMaintenance rejects %s", async (_, answer) => {
        answers.set("next_maintenance", () => answer);
        await expect(nextMaintenance()).rejects.toBeDefined();
    });

    it("nextMaintenance passes a time through", async () => {
        answers.set("next_maintenance", () => 1_700_000_000);
        await expect(nextMaintenance()).resolves.toBe(1_700_000_000);
    });
});
