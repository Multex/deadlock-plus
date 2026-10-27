import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/core/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => {}) }));
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { t } from "$lib/core/i18n.svelte";
import { ServerPicker } from "./picker.svelte";

const GROUP = {
    id: "ams",
    description: "Amsterdam",
    countryCode: "NL",
    relayIps: ["1.1.1.1"],
    isCluster: false,
    routingNote: null,
};

function healthy() {
    answers.clear();
    answers.set("firewall_capability", () => ({ supported: false }));
    answers.set("get_game_definitions", () => [{ id: "deadlock", displayName: "Deadlock" }]);
    answers.set("fetch_server_groups", () => ({ clustered: [], unclustered: [GROUP] }));
    answers.set("ping_server_groups", () => ({ ams: 20 }));
}

describe("server picker load state", () => {
    beforeEach(healthy);

    it("loads the list", async () => {
        const picker = new ServerPicker();
        await picker.loadAll();
        expect(picker.error).toBeNull();
        expect(picker.serverData?.unclustered).toHaveLength(1);
    });

    it("sets an error when get_game_definitions throws", async () => {
        answers.set("get_game_definitions", () => {
            throw { code: "common.internal" };
        });
        const picker = new ServerPicker();
        await picker.loadAll();
        expect(picker.error).toBe(t("server_picker.load_failed"));
        expect(picker.loading).toBe(false);
    });

    it("sets an error when fetch_server_groups answers null", async () => {
        answers.set("fetch_server_groups", () => null);
        const picker = new ServerPicker();
        await picker.loadAll();
        expect(picker.error).toBe(t("server_picker.load_failed"));
        expect(picker.serverData).toBeNull();
    });

    it("sets the same calm error when fetch_server_groups throws", async () => {
        answers.set("fetch_server_groups", () => {
            throw new Error("boom");
        });
        const picker = new ServerPicker();
        await picker.loadAll();
        expect(picker.error).toBe(t("server_picker.load_failed"));
    });

    it("recovers when loadAll runs again", async () => {
        answers.set("fetch_server_groups", () => null);
        const picker = new ServerPicker();
        await picker.loadAll();
        healthy();
        await picker.loadAll();
        expect(picker.error).toBeNull();
        expect(picker.serverData?.unclustered).toHaveLength(1);
    });

    it("gives every row a no-reply ping when ping_server_groups answers null", async () => {
        answers.set("ping_server_groups", () => null);
        const picker = new ServerPicker();
        await picker.loadAll();
        await vi.waitFor(() => expect(picker.pinging).toBe(false));
        expect(picker.pings).toEqual({ ams: null });
    });
});
