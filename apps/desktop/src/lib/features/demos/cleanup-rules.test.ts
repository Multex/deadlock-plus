import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

import { cleanupFailed, persistRules } from "./cleanup-rules";
import type { CleanupRule } from "./demos";

const stored: CleanupRule[] = [
    { id: 1, enabled: false, kind: "olderThanDays", days: 30 },
    { id: 2, enabled: false, kind: "outdated" },
];
const edited: CleanupRule[] = [
    { id: 1, enabled: true, kind: "olderThanDays", days: 7 },
    { id: 2, enabled: false, kind: "outdated" },
];

describe("saving cleanup rules", () => {
    beforeEach(() => toast.error.mockReset());

    it("keeps the edit when the save works", async () => {
        const save = vi.fn(async () => {});
        const result = await persistRules(edited, stored, save);
        expect(save).toHaveBeenCalledWith(edited);
        expect(result).toEqual({ saved: true, rules: edited });
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("goes back to the stored rules and says so once when the save fails", async () => {
        const save = vi.fn(async () => {
            throw { code: "common.io" };
        });
        const result = await persistRules(edited, stored, save);
        expect(result).toEqual({ saved: false, rules: stored });
        expect(result.rules).not.toBe(stored);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't save the cleanup rules. They were changed back.");
    });

    it("never shows developer text", async () => {
        await persistRules(edited, stored, async () => {
            throw new Error("EACCES at rules.rs");
        });
        expect(toast.error.mock.calls[0][0]).not.toMatch(/EACCES|rules\.rs/);
    });
});

describe("other cleanup dialog failures", () => {
    beforeEach(() => toast.error.mockReset());

    it("names what could not load", () => {
        cleanupFailed({ code: "common.internal" }, "load");
        expect(toast.error).toHaveBeenCalledWith("Couldn't load the cleanup rules.");
    });

    it("names what could not be checked", () => {
        cleanupFailed(new Error("x"), "check");
        expect(toast.error).toHaveBeenCalledWith("Couldn't check which replays match.");
    });
});
