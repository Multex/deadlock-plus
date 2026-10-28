import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate } from "$lib/core/i18n.svelte";

const state = vi.hoisted(() => ({
    cachedAt: null as number | null,
    status: "ready" as string,
    matches: [] as unknown[],
    busy: { active: false },
}));

vi.mock("../../stats.svelte", () => ({ stats: state }));

import CachedNote from "./cached-note.svelte";

const SAVED_AT = Date.UTC(2026, 9, 28, 18, 30, 15);

const savedTime = formatDate(SAVED_AT, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
});

const text = () =>
    render(CachedNote)
        .body.replace(/<!--.*?-->/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();

describe("cached note", () => {
    beforeEach(() => {
        state.cachedAt = SAVED_AT;
        state.status = "ready";
        state.matches = [];
        state.busy.active = false;
    });

    it("says the API is busy and loads on its own while a retry is pending", () => {
        state.busy.active = true;
        expect(text()).toBe(
            `Showing what Deadlock+ saved ${savedTime} while the Deadlock API is busy. Fresh data loads on its own.`,
        );
    });

    it("says the API cannot be reached when nothing retries", () => {
        expect(text()).toBe(`Deadlock+ can't reach the Deadlock API right now. Showing the copy saved ${savedTime}.`);
    });

    it("switches from the busy text to the down text when the busy state ends but the copy stays", () => {
        state.busy.active = true;
        expect(text()).toContain("while the Deadlock API is busy");
        state.busy.active = false;
        expect(text()).toContain("can't reach the Deadlock API right now");
    });

    it("drops the note once fresh data has loaded", () => {
        state.busy.active = true;
        expect(text()).not.toBe("");
        state.cachedAt = null;
        state.busy.active = false;
        expect(text()).toBe("");
    });
});
