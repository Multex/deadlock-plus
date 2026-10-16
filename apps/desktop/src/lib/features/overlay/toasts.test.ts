import { describe, expect, it } from "vitest";
import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";

import {
    CORNER_LIMIT,
    NO_TOASTS,
    cornerPosition,
    createToastQueue,
    expire,
    nextExpiry,
    reposition,
    show,
    stackOrder,
    type OverlayToasts,
} from "./toasts";

function toast(id: string, overrides: Partial<OverlayToast> = {}): OverlayToast {
    return {
        id,
        kind: "alert",
        title: `Title ${id}`,
        body: `Body ${id}`,
        placement: "corner",
        position: "topRight",
        durationMs: 6000,
        ...overrides,
    };
}

const ids = (state: OverlayToasts) => state.corner.map((s) => s.toast.id);

describe("show", () => {
    it("adds a corner toast that expires after its duration", () => {
        const state = show(NO_TOASTS, toast("a", { durationMs: 4000 }), 1000);
        expect(state.corner).toEqual([{ toast: toast("a", { durationMs: 4000 }), expiresAt: 5000 }]);
        expect(state.center).toBeNull();
    });

    it("keeps at most three corner toasts, dropping the oldest", () => {
        let state = NO_TOASTS;
        for (const id of ["a", "b", "c", "d"]) state = show(state, toast(id), 0);
        expect(CORNER_LIMIT).toBe(3);
        expect(ids(state)).toEqual(["b", "c", "d"]);
    });

    it("lets a newer center toast replace the shown one", () => {
        let state = show(NO_TOASTS, toast("a", { placement: "center" }), 0);
        state = show(state, toast("b", { placement: "center", durationMs: 2000 }), 500);
        expect(state.center).toEqual({ toast: toast("b", { placement: "center", durationMs: 2000 }), expiresAt: 2500 });
    });

    it("shows a corner stack and a center toast together", () => {
        let state = show(NO_TOASTS, toast("a"), 0);
        state = show(state, toast("b", { placement: "center" }), 0);
        state = show(state, toast("c"), 0);
        expect(ids(state)).toEqual(["a", "c"]);
        expect(state.center?.toast.id).toBe("b");
    });

    it("replaces a corner toast that arrives again with the same id", () => {
        let state = show(NO_TOASTS, toast("a"), 0);
        state = show(state, toast("b"), 0);
        state = show(state, toast("a", { title: "Again" }), 100);
        expect(ids(state)).toEqual(["b", "a"]);
        expect(state.corner[1]).toEqual({ toast: toast("a", { title: "Again" }), expiresAt: 6100 });
    });
});

describe("expire", () => {
    it("removes toasts whose time is up and keeps the rest", () => {
        let state = show(NO_TOASTS, toast("a", { durationMs: 1000 }), 0);
        state = show(state, toast("b", { durationMs: 3000 }), 0);
        state = show(state, toast("c", { placement: "center", durationMs: 1000 }), 0);
        state = expire(state, 1000);
        expect(ids(state)).toEqual(["b"]);
        expect(state.center).toBeNull();
    });

    it("returns the same state when nothing expired", () => {
        const state = show(NO_TOASTS, toast("a"), 0);
        expect(expire(state, 10)).toBe(state);
    });
});

describe("nextExpiry", () => {
    it("is the earliest expiry across the stack and the center", () => {
        let state = show(NO_TOASTS, toast("a", { durationMs: 5000 }), 0);
        state = show(state, toast("b", { placement: "center", durationMs: 2000 }), 0);
        expect(nextExpiry(state)).toBe(2000);
    });

    it("is null with nothing shown", () => {
        expect(nextExpiry(NO_TOASTS)).toBeNull();
    });
});

describe("cornerPosition", () => {
    it("follows the newest corner toast", () => {
        let state = show(NO_TOASTS, toast("a", { position: "topLeft" }), 0);
        state = show(state, toast("b", { position: "bottomRight" }), 0);
        state = show(state, toast("c", { placement: "center", position: "left" }), 0);
        expect(cornerPosition(state)).toBe("bottomRight");
    });

    it("is top right with no corner toast", () => {
        expect(cornerPosition(NO_TOASTS)).toBe("topRight");
    });
});

describe("reposition", () => {
    it("moves every corner toast and keeps their order and expiry", () => {
        let state = show(NO_TOASTS, toast("a"), 0);
        state = show(state, toast("b"), 500);
        const moved = reposition(state, "bottomLeft");
        expect(cornerPosition(moved)).toBe("bottomLeft");
        expect(moved.corner.map((s) => [s.toast.id, s.toast.position, s.expiresAt])).toEqual([
            ["a", "bottomLeft", 6000],
            ["b", "bottomLeft", 6500],
        ]);
    });

    it("leaves the center toast where it is", () => {
        const state = show(NO_TOASTS, toast("c", { placement: "center" }), 0);
        expect(reposition(state, "left").center).toBe(state.center);
    });

    it("returns the same state when nothing moves", () => {
        const state = show(NO_TOASTS, toast("a", { position: "left" }), 0);
        expect(reposition(state, "left")).toBe(state);
        expect(reposition(NO_TOASTS, "left")).toBe(NO_TOASTS);
    });
});

describe("stackOrder", () => {
    const three = (position: OverlayPosition) =>
        ["a", "b", "c"].reduce((state, id) => show(state, toast(id, { position }), 0), NO_TOASTS);

    it.each(["topLeft", "topCenter", "topRight", "left", "right"] as const)(
        "puts the newest toast on top at %s",
        (position) => {
            expect(stackOrder(three(position)).map((s) => s.toast.id)).toEqual(["c", "b", "a"]);
        },
    );

    it.each(["bottomLeft", "bottomCenter", "bottomRight"] as const)(
        "puts the newest toast at the bottom at %s",
        (position) => {
            expect(stackOrder(three(position)).map((s) => s.toast.id)).toEqual(["a", "b", "c"]);
        },
    );
});

function fakeClock(start = 0) {
    let time = start;
    let timers: { at: number; cb: () => void; handle: number }[] = [];
    let next = 1;
    return {
        now: () => time,
        setTimeout(cb: () => void, ms: number) {
            const handle = next++;
            timers.push({ at: time + ms, cb, handle });
            return handle;
        },
        clearTimeout(handle: unknown) {
            timers = timers.filter((t) => t.handle !== handle);
        },
        pending: () => timers.length,
        advance(ms: number) {
            const until = time + ms;
            for (;;) {
                const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
                if (!due) break;
                timers = timers.filter((t) => t !== due);
                time = due.at;
                due.cb();
            }
            time = until;
        },
    };
}

describe("toast queue", () => {
    it("publishes each toast and removes it when its time is up", () => {
        const clock = fakeClock();
        const seen: OverlayToasts[] = [];
        const queue = createToastQueue(clock, (state) => seen.push(state));

        queue.push(toast("a", { durationMs: 1000 }));
        queue.push(toast("b", { placement: "center", durationMs: 3000 }));
        expect(ids(seen.at(-1)!)).toEqual(["a"]);
        expect(seen.at(-1)!.center?.toast.id).toBe("b");

        clock.advance(999);
        expect(ids(seen.at(-1)!)).toEqual(["a"]);
        clock.advance(1);
        expect(ids(seen.at(-1)!)).toEqual([]);
        expect(seen.at(-1)!.center?.toast.id).toBe("b");
        clock.advance(2000);
        expect(seen.at(-1)).toEqual(NO_TOASTS);
        expect(clock.pending()).toBe(0);
    });

    it("keeps one timer, set for the earliest expiry", () => {
        const clock = fakeClock();
        const queue = createToastQueue(clock, () => {});
        queue.push(toast("a", { durationMs: 5000 }));
        queue.push(toast("b", { durationMs: 1000 }));
        expect(clock.pending()).toBe(1);
    });

    it("moves the toasts on screen when the position changes", () => {
        const seen: OverlayToasts[] = [];
        const queue = createToastQueue(fakeClock(), (state) => seen.push(state));
        queue.push(toast("a"));
        queue.reposition("bottomRight");
        expect(cornerPosition(seen.at(-1)!)).toBe("bottomRight");
    });

    it("stops its timer when disposed", () => {
        const clock = fakeClock();
        const seen: OverlayToasts[] = [];
        const queue = createToastQueue(clock, (state) => seen.push(state));
        queue.push(toast("a", { durationMs: 1000 }));
        queue.dispose();
        clock.advance(5000);
        expect(clock.pending()).toBe(0);
        expect(seen).toHaveLength(1);
    });
});
