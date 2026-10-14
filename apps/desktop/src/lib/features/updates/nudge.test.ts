import { describe, expect, it, vi } from "vitest";
import {
    BANNER_AFTER_MS,
    RECHECK_ON_SHOW_MIN_MS,
    bannerDue,
    createShownTracker,
    firstSeenAt,
    shouldRecheckOnShow,
    type FirstSeenStore,
} from "./nudge";

function memoryStore(initial: string | null = null): FirstSeenStore & { value: string | null } {
    return {
        value: initial,
        get() {
            return this.value;
        },
        set(value) {
            this.value = value;
        },
    };
}

describe("re-check on window show", () => {
    it("checks when nothing has been checked yet", () => {
        expect(shouldRecheckOnShow(null, 1_000)).toBe(true);
    });

    it("skips a show that comes soon after the last check", () => {
        expect(shouldRecheckOnShow(0, RECHECK_ON_SHOW_MIN_MS - 1)).toBe(false);
    });

    it("checks once the last check is old enough", () => {
        expect(shouldRecheckOnShow(0, RECHECK_ON_SHOW_MIN_MS)).toBe(true);
    });
});

describe("first seen", () => {
    it("records the first time a version is seen and keeps it on later sightings", () => {
        const store = memoryStore();
        expect(firstSeenAt(store, "0.12.0", 100)).toBe(100);
        expect(firstSeenAt(store, "0.12.0", 999)).toBe(100);
    });

    it("survives a relaunch through the store", () => {
        const store = memoryStore();
        firstSeenAt(store, "0.12.0", 100);
        expect(firstSeenAt(memoryStore(store.value), "0.12.0", 5_000)).toBe(100);
    });

    it("starts over for a newer version", () => {
        const store = memoryStore();
        firstSeenAt(store, "0.12.0", 100);
        expect(firstSeenAt(store, "0.12.1", 700)).toBe(700);
    });

    it("treats an unreadable stored value as not seen", () => {
        expect(firstSeenAt(memoryStore("{not json"), "0.12.0", 42)).toBe(42);
    });
});

describe("banner rule", () => {
    it("waits until the update has been known for more than a day", () => {
        expect(bannerDue(0, BANNER_AFTER_MS)).toBe(false);
        expect(bannerDue(0, BANNER_AFTER_MS + 1)).toBe(true);
    });
});

describe("update shown", () => {
    it("reports each version at most once", () => {
        const send = vi.fn();
        const shown = createShownTracker(send);
        shown("0.12.0");
        shown("0.12.0");
        shown("0.12.1");
        shown("0.12.0");
        expect(send.mock.calls).toEqual([["0.12.0"], ["0.12.1"]]);
    });
});
