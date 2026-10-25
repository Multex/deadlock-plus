import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ command: vi.fn(async () => undefined) }));
vi.mock("$lib/core/tauri", () => tauri);

import { notifyDispatchEdition } from "./api";

describe("Dispatch notification", () => {
    beforeEach(() => tauri.command.mockClear());

    it("asks the backend to announce a weekly or monthly edition", async () => {
        await notifyDispatchEdition("weekly");
        await notifyDispatchEdition("monthly");
        expect(tauri.command.mock.calls).toEqual([
            ["notify_dispatch_edition", { edition: "weekly" }],
            ["notify_dispatch_edition", { edition: "monthly" }],
        ]);
    });
});
