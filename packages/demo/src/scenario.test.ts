import { afterEach, describe, expect, it, vi } from "vitest";
import { defineScenario, install, type DemoHandle, type Module, type ScenarioSpec } from "./scenario";

const NOW = Date.UTC(2026, 9, 12, 19, 30, 0);
const IDENTITY = { accountId: 90000001, steamId64: "76561198050265729", persona: "Lantern", names: ["Sable"] };

const counter: Module = {
    name: "counter",
    create: () => {
        let count = 0;
        return {
            handlers: { bump: () => ++count, count: () => count },
            kv: { settings: { theme: "default" } },
            routes: [[/^\/v1\/count$/, () => count]],
        };
    },
};

const spec = (modules: Module[]): ScenarioSpec => ({ id: "test", identity: IDENTITY, now: NOW, seed: 5, modules });

describe("scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (...args: Parameters<typeof install>) => {
        const handle = install(...args);
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.restoreAllMocks();
    });

    it("gives every install its own state", () => {
        const scenario = defineScenario(spec([counter]));
        const first = start(scenario);
        first.invoke("bump", {});
        first.invoke("kv_set", { store: "settings", key: "theme", value: "dark" });

        const second = start(scenario);
        expect(second.invoke("count", {})).toBe(0);
        expect(second.invoke("kv_get", { store: "settings", key: "theme" })).toBe("default");
        expect(first.invoke("count", {})).toBe(1);
    });

    it("hands each module the scenario's identity, clock and seed", () => {
        const create = vi.fn(() => ({}));
        start(defineScenario(spec([{ name: "probe", create }])));
        expect(create).toHaveBeenLastCalledWith({ identity: IDENTITY, now: NOW, seed: 5 });
    });

    it("refuses two modules that answer the same command", () => {
        const other: Module = { name: "other", create: () => ({ handlers: { count: () => -1 } }) };
        expect(() => defineScenario(spec([counter, other]))).toThrow(
            '[demo] scenario "test": modules "counter" and "other" both handle command "count"',
        );
    });

    it("lets a module replace a command it names as an override", () => {
        const other: Module = {
            name: "other",
            overrides: ["count"],
            create: () => ({ handlers: { count: () => -1 } }),
        };
        const handle = start(defineScenario(spec([counter, other])));
        expect(handle.invoke("count", {})).toBe(-1);
        expect(handle.invoke("bump", {})).toBe(1);
    });

    it("refuses an override of a command no earlier module answers", () => {
        const other: Module = { name: "other", overrides: ["nope"], create: () => ({ handlers: { nope: () => 1 } }) };
        expect(() => defineScenario(spec([counter, other]))).toThrow(
            '[demo] scenario "test": module "other" overrides command "nope", which no earlier module handles',
        );
    });

    it("merges KV seeds key by key, and refuses two modules that seed the same key", () => {
        const fine: Module = { name: "fine", create: () => ({ kv: { settings: { language: "en" } } }) };
        const handle = start(defineScenario(spec([counter, fine])));
        expect(handle.invoke("kv_get", { store: "settings", key: "theme" })).toBe("default");
        expect(handle.invoke("kv_get", { store: "settings", key: "language" })).toBe("en");

        const clash: Module = { name: "clash", create: () => ({ kv: { settings: { theme: "dark" } } }) };
        expect(() => defineScenario(spec([counter, clash]))).toThrow(
            '[demo] scenario "test": modules "counter" and "clash" both seed KV key "settings/theme"',
        );
    });

    it("refuses two modules that answer the same API route", () => {
        const clash: Module = { name: "clash", create: () => ({ routes: [[/^\/v1\/count$/, () => 9]] }) };
        expect(() => defineScenario(spec([counter, clash]))).toThrow(
            '[demo] scenario "test": modules "counter" and "clash" both answer API route "^\\/v1\\/count$"',
        );
    });

    it("builds a changed copy with `with`, leaving the original as it was", async () => {
        vi.stubGlobal("fetch", async () => new Response("real"));
        const base = defineScenario(spec([counter]));
        const changed = base.with({
            handlers: { count: () => 99 },
            kv: { settings: { theme: "dark", language: "de" } },
            routes: [[/^\/v1\/count$/, () => "overridden"]],
        });
        expect(changed).toMatchObject({ id: "test", identity: IDENTITY, now: NOW, seed: 5 });

        const plain = start(base);
        expect(plain.invoke("count", {})).toBe(0);
        expect(plain.invoke("kv_get", { store: "settings", key: "theme" })).toBe("default");
        expect(await (await fetch("https://api.deadlock-api.com/v1/count")).json()).toBe(0);
        handles.pop()!.uninstall();

        const handle = start(changed);
        expect(handle.invoke("count", {})).toBe(99);
        expect(handle.invoke("bump", {})).toBe(1);
        expect(handle.invoke("kv_get", { store: "settings", key: "theme" })).toBe("dark");
        expect(handle.invoke("kv_get", { store: "settings", key: "language" })).toBe("de");
        expect(await (await fetch("https://api.deadlock-api.com/v1/count")).json()).toBe("overridden");
    });

    it("stacks a second `with` on the first", () => {
        const scenario = defineScenario(spec([counter]))
            .with({ handlers: { count: () => 1, extra: () => "a" } })
            .with({ handlers: { count: () => 2 } });
        const handle = start(scenario);
        expect(handle.invoke("count", {})).toBe(2);
        expect(handle.invoke("extra", {})).toBe("a");
    });

    it("moves the clock to the scenario's now, and gives the real one back", () => {
        const real = Date;
        const handle = install(defineScenario(spec([counter])));
        expect(Math.abs(Date.now() - NOW)).toBeLessThan(1000);
        handle.uninstall();
        expect(Date).toBe(real);
    });

    it("replaces Math.random with the scenario's seeded numbers, and gives the real one back", () => {
        const real = Math.random;
        const scenario = defineScenario(spec([counter]));
        const first = install(scenario);
        const a = [Math.random(), Math.random(), Math.random()];
        first.uninstall();
        const second = install(scenario);
        const b = [Math.random(), Math.random(), Math.random()];
        second.uninstall();
        expect(a).toEqual(b);
        expect(Math.random).toBe(real);

        const other = install(defineScenario({ ...spec([counter]), seed: 6 }));
        expect(Math.random()).not.toBe(a[0]);
        other.uninstall();
    });

    it("answers the scenario's API routes through fetch, and gives the real fetch back", async () => {
        const network = vi.fn(async () => new Response("real"));
        vi.stubGlobal("fetch", network);
        const handle = install(defineScenario(spec([counter])));
        handle.invoke("bump", {});
        expect(await (await fetch("https://api.deadlock-api.com/v1/count")).json()).toBe(1);
        expect(network).not.toHaveBeenCalled();
        handle.uninstall();
        expect(fetch).toBe(network);
    });

    it("takes a new handler mid-run", () => {
        const handle = start(defineScenario(spec([counter])));
        handle.set("count", () => 41);
        expect(handle.invoke("count", {})).toBe(41);
    });

    it("sends an emitted event to whoever subscribed", () => {
        const handle = start(defineScenario(spec([counter])));
        const listener = vi.fn();
        handle.onEvent(listener);
        handle.emit("live-state", { phase: "inMatch" });
        expect(listener).toHaveBeenCalledWith("live-state", { phase: "inMatch" });
    });

    it("lists the commands nothing answered", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const handle = start(defineScenario(spec([counter])));
        expect(() => handle.invoke("get_missing", {})).toThrow("[demo] unhandled command: get_missing");
        expect(handle.unhandled()).toEqual(["get_missing"]);
        expect(handle.scenario).toBe("test");
    });
});
