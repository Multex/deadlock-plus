import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ set: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => undefined),
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/core/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: kv.set }));
vi.mock("svelte-sonner", () => ({ toast }));

import { ServerPicker } from "./picker.svelte";
import type { Preset } from "./presets";

const PRESET: Preset = { id: "p1", name: "Europe", mode: "allow", regionIds: ["ams"] };

describe("presets when the write fails", () => {
    beforeEach(() => {
        kv.set.mockReset();
        kv.set.mockResolvedValue(undefined);
        toast.error.mockReset();
        toast.success.mockReset();
    });

    it("keeps the list as it was and says the preset was not saved", async () => {
        const picker = new ServerPicker();
        await picker.savePreset(PRESET);
        kv.set.mockRejectedValue({ code: "common.io" });
        await picker.savePreset({ ...PRESET, id: "p2", name: "Asia" });
        expect(picker.presets.map((p) => p.id)).toEqual(["p1"]);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't save the preset. Try again.");
        expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it("keeps the preset and says it was not deleted", async () => {
        const picker = new ServerPicker();
        await picker.savePreset(PRESET);
        kv.set.mockRejectedValue(new Error("disk full"));
        await picker.deletePreset("p1");
        expect(picker.presets.map((p) => p.id)).toEqual(["p1"]);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't delete the preset. Try again.");
    });
});
