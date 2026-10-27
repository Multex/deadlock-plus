import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers, toast } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("svelte-sonner", () => ({ toast }));

import { Mutes } from "./mutes.svelte";

const TEXT =
    "<!-- kv3 encoding:text:version{e21c7f3c} format:generic:version{7412167c} -->\n{\n\tusers = null\n\tplayer_volume_map = null\n}";
const FILE = { path: "C:/voice_ban.dat", exists: true, text: TEXT, gameRunning: false };

describe("a mute change that fails to save", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("read_voice_ban", () => FILE);
        toast.error.mockReset();
        toast.success.mockReset();
    });

    it("says the change did not save, keeps the input and frees the controls", async () => {
        answers.set("write_voice_ban", () => Promise.reject(new Error("EACCES at fs.rs:12")));
        const mutes = new Mutes();
        await mutes.load();
        mutes.addInput = "76561198000000001";
        await mutes.mute(["76561198000000001"]);
        expect(toast.error).toHaveBeenCalledWith("Couldn't save your mutes. Try again.");
        expect(toast.success).not.toHaveBeenCalled();
        expect(mutes.busy).toBe(false);
        expect(mutes.addInput).toBe("76561198000000001");
    });
});
