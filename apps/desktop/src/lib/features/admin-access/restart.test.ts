import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/i18n.svelte", () => ({ t: (key: string) => key }));

import { RestartAsAdmin } from "./restart.svelte";

describe("RestartAsAdmin", () => {
    it("stays pending after launched, until the app quits", async () => {
        const restart = new RestartAsAdmin(async () => "launched");
        await restart.run();
        expect(restart.pending).toBe(true);
        expect(restart.error).toBeNull();
    });

    it("goes back to idle without an error when cancelled", async () => {
        const restart = new RestartAsAdmin(async () => "cancelled");
        await restart.run();
        expect(restart.pending).toBe(false);
        expect(restart.error).toBeNull();
    });

    it("shows a short error when the command throws, then clears it on the next try", async () => {
        const call = vi.fn<() => Promise<"launched" | "cancelled">>().mockRejectedValueOnce(new Error("boom"));
        const restart = new RestartAsAdmin(call);
        await restart.run();
        expect(restart.pending).toBe(false);
        expect(restart.error).toBe("admin_access.game_admin.restart_failed");

        call.mockResolvedValueOnce("cancelled");
        await restart.run();
        expect(restart.error).toBeNull();
    });

    it("ignores a second click while pending", async () => {
        const call = vi.fn(async () => "launched" as const);
        const restart = new RestartAsAdmin(call);
        await restart.run();
        await restart.run();
        expect(call).toHaveBeenCalledTimes(1);
    });
});
