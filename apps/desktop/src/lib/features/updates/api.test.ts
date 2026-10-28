import { describe, expect, it, vi } from "vitest";

const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("$lib/core/tauri", () => ({ command }));
vi.mock("$lib/core/updater", () => ({
    Update: class {
        constructor(readonly metadata: unknown) {}
    },
}));

import { checkUpdate } from "./api";

const METADATA = {
    rid: 7,
    currentVersion: "0.14.0",
    version: "0.15.0-beta.1",
    date: "2026-10-28T03:00:00Z",
    body: "notes",
    rawJson: {},
};

describe("checkUpdate", () => {
    it("asks the backend about one channel and wraps the answer in the plugin's update", async () => {
        command.mockResolvedValue(METADATA);
        const update = await checkUpdate("beta");
        expect(command).toHaveBeenCalledWith("check_update", { channel: "beta" });
        expect(update).toEqual({ metadata: METADATA });
    });

    it("resolves null when the channel has nothing newer", async () => {
        command.mockResolvedValue(null);
        expect(await checkUpdate("release")).toBeNull();
    });
});
