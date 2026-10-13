import { describe, expect, it, vi } from "vitest";
import { createBackend } from "./backend";

describe("demo backend", () => {
    it("answers a command from its handler, with the arguments it was sent", () => {
        const backend = createBackend({ get_thing: (args) => ({ id: args.id }) }, {});
        expect(backend.handle("get_thing", { id: 7 })).toEqual({ id: 7 });
    });

    it("serves seeded KV values and remembers writes", () => {
        const backend = createBackend({}, { "app-settings": { theme: "default" } });
        expect(backend.handle("kv_get", { store: "app-settings", key: "theme" })).toBe("default");
        expect(backend.handle("kv_get", { store: "app-settings", key: "missing" })).toBeNull();
        backend.handle("kv_set", { store: "presets", key: "a", value: [1] });
        expect(backend.handle("kv_get", { store: "presets", key: "a" })).toEqual([1]);
        backend.handle("kv_delete", { store: "presets", key: "a" });
        expect(backend.handle("kv_get", { store: "presets", key: "a" })).toBeNull();
    });

    it("hands out copies, so a page cannot edit the seed", () => {
        const backend = createBackend({}, { presets: { list: [{ name: "a" }] } });
        const first = backend.handle("kv_get", { store: "presets", key: "list" }) as { name: string }[];
        first[0]!.name = "edited";
        expect(backend.handle("kv_get", { store: "presets", key: "list" })).toEqual([{ name: "a" }]);
    });

    it("copies the seed, so two backends built from one seed do not share writes", () => {
        const seed = { presets: { list: [{ name: "a" }] } };
        const first = createBackend({}, seed);
        first.handle("kv_set", { store: "presets", key: "list", value: [] });
        expect(createBackend({}, seed).handle("kv_get", { store: "presets", key: "list" })).toEqual([{ name: "a" }]);
        expect(seed.presets.list).toEqual([{ name: "a" }]);
    });

    it("keeps its state apart from the page: handlers get copies of arguments, callers get copies of results", async () => {
        const stored: unknown[] = [];
        const row = { id: 1 };
        const backend = createBackend(
            { save: (args) => void stored.push(args.rule), list: () => stored, later: async () => row },
            {},
        );
        const rule = { enabled: true };
        backend.handle("save", { rule });
        rule.enabled = false;
        const listed = backend.handle("list", {}) as { enabled: boolean }[];
        expect(listed).toEqual([{ enabled: true }]);
        listed.length = 0;
        expect(backend.handle("list", {})).toEqual([{ enabled: true }]);

        const answered = (await backend.handle("later", {})) as { id: number };
        expect(answered).toEqual({ id: 1 });
        expect(answered).not.toBe(row);
    });

    it("swallows plugin calls that have nothing to show", () => {
        const backend = createBackend({}, {});
        expect(backend.handle("plugin:log|log", { message: "x" })).toBeNull();
        expect(backend.handle("plugin:updater|check", {})).toBeNull();
    });

    it("rejects an unknown command by name, and reports it once", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const backend = createBackend({}, {});
        expect(() => backend.handle("get_missing", {})).toThrow("get_missing");
        expect(() => backend.handle("get_missing", {})).toThrow("get_missing");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith("[demo] unhandled command: get_missing");
        expect(backend.unhandled()).toEqual(["get_missing"]);
        warn.mockRestore();
    });

    it("takes a new handler while running, without touching the record it was built from", () => {
        const handlers = { is_game_running: () => false };
        const backend = createBackend(handlers, {});
        backend.set("is_game_running", () => true);
        expect(backend.handle("is_game_running", {})).toBe(true);
        expect(handlers.is_game_running()).toBe(false);
        expect(createBackend(handlers, {}).handle("is_game_running", {})).toBe(false);
    });
});
