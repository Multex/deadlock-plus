import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREF_KEYS } from "$lib/core/prefs";
import { loadLogViewPrefs, saveLogAutoScroll, saveLogMinLevel } from "./view-prefs";

function memoryStorage() {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
    };
}

describe("log view prefs", () => {
    let storage: ReturnType<typeof memoryStorage>;

    beforeEach(() => {
        storage = memoryStorage();
        vi.stubGlobal("localStorage", storage);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("keeps the persisted key names", () => {
        expect(PREF_KEYS.logAutoScroll).toBe("deadlock-plus:log-auto-scroll");
        expect(PREF_KEYS.logMinLevel).toBe("deadlock-plus:log-min-level");
    });

    it("defaults to INFO with auto-scroll on", () => {
        expect(loadLogViewPrefs()).toEqual({ level: "INFO", autoScroll: true });
    });

    it("round-trips the minimum level", () => {
        saveLogMinLevel("DEBUG");
        expect(storage.data.get("deadlock-plus:log-min-level")).toBe("DEBUG");
        expect(loadLogViewPrefs().level).toBe("DEBUG");
    });

    it("round-trips auto-scroll off and back on", () => {
        saveLogAutoScroll(false);
        expect(loadLogViewPrefs().autoScroll).toBe(false);
        saveLogAutoScroll(true);
        expect(loadLogViewPrefs().autoScroll).toBe(true);
    });

    it("falls back to INFO for an unknown stored level", () => {
        storage.data.set("deadlock-plus:log-min-level", "VERBOSE");
        expect(loadLogViewPrefs().level).toBe("INFO");
    });

    it("falls back to INFO for a level the menu does not offer", () => {
        storage.data.set("deadlock-plus:log-min-level", "TRACE");
        expect(loadLogViewPrefs().level).toBe("INFO");
    });
});
