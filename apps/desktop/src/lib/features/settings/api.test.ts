import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { getAppInfo, overlayStatus } from "./api";

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
});
