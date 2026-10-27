import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ setPresenceConfig: vi.fn(async () => {}) }));

import { PresenceConfigStore, type PresenceConfigApi } from "./config.svelte";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";

const empty = (): PresenceConfig => ({ states: {}, variants: {}, heroes: {} });

function api(overrides: Partial<PresenceConfigApi>): PresenceConfigApi {
    return {
        presenceConfig: vi.fn(async () => empty()),
        setPresenceConfig: vi.fn(async () => {}),
        presenceDefaults: vi.fn(async () => empty()),
        presenceLayout: vi.fn(async () => []),
        presencePlaceholders: vi.fn(async () => []),
        exportPresenceConfig: vi.fn(async () => "{}"),
        importPresenceConfig: vi.fn(async () => empty()),
        ...overrides,
    };
}

describe("presence editor actions that fail", () => {
    it("a failed save says the change is not saved, without developer text", async () => {
        const store = new PresenceConfigStore(
            api({ setPresenceConfig: vi.fn(async () => Promise.reject(new Error("serde at line 4"))) }),
        );
        store.edit(empty());
        await store.flush();
        expect(store.error).toBe("Couldn't save your Discord activity changes. Try again.");
    });

    it("a failed import keeps the editor as it was and says the preset was not read", async () => {
        const before: PresenceConfig = { states: { inMatch: { details: "mine" } }, variants: {}, heroes: {} };
        const store = new PresenceConfigStore(
            api({ importPresenceConfig: vi.fn(async () => Promise.reject({ code: "common.internal" })) }),
        );
        store.config = before;
        await expect(store.importText("nope")).resolves.toBe(false);
        expect(store.importError).toBe("Couldn't read that preset.");
        expect(store.config.states.inMatch?.details).toBe("mine");
    });

    it("a later import that works clears the error", async () => {
        const importPresenceConfig = vi
            .fn<PresenceConfigApi["importPresenceConfig"]>()
            .mockRejectedValueOnce(new Error("bad"))
            .mockResolvedValueOnce(empty());
        const store = new PresenceConfigStore(api({ importPresenceConfig }));
        await store.importText("nope");
        await expect(store.importText("{}")).resolves.toBe(true);
        expect(store.importError).toBe("");
    });
});
