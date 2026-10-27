import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { clearEntries, clearMessages } from "./clear";

describe("clearing storage when the backend fails", () => {
    it("reports a thrown clear as one calm failure and stops", async () => {
        const clear = vi.fn(async () => {
            throw new Error("os error 5 at fs.rs");
        });
        const outcome = await clearEntries(["shaderCache", "logs"] as never, clear);
        expect(clear).toHaveBeenCalledTimes(1);
        expect(clearMessages(outcome)).toEqual([{ kind: "error", text: "Couldn't clear 1 item. Try again." }]);
    });

    it("keeps what was freed and names the files it could not remove", async () => {
        const clear = vi.fn(async () => ({
            freedBytes: 2048,
            removed: 3,
            failed: [{ code: "common.io", params: {} }],
        }));
        const outcome = await clearEntries(["logs"] as never, clear);
        expect(clearMessages(outcome)).toEqual([
            { kind: "success", text: "Freed 2.0 KB" },
            { kind: "error", text: "Couldn't clear 1 item. Try again." },
        ]);
    });

    it("never shows developer text or the log hint", async () => {
        const clear = vi.fn(async () => {
            throw { code: "common.internal" };
        });
        const [message] = clearMessages(await clearEntries(["logs"] as never, clear));
        expect(message.text).not.toMatch(/log|fs\.rs/i);
    });
});
