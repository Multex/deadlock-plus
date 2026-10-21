import { describe, expect, it, vi } from "vitest";
import { createDrag, dispatchDrop, isCopy, pastThreshold, type DragPayload, type DragState } from "./drag.svelte";

function pointer(type: string, init: Partial<PointerEvent> = {}): Event {
    return Object.assign(new Event(type), {
        clientX: 0,
        clientY: 0,
        button: 0,
        ctrlKey: false,
        altKey: false,
        ...init,
    });
}

function key(type: string, init: Partial<KeyboardEvent>): Event {
    return Object.assign(new Event(type, { cancelable: true }), { ctrlKey: false, altKey: false, ...init });
}

function setup() {
    const host = new EventTarget();
    const drag = createDrag(() => host);
    const start = pointer("pointerdown", { clientX: 10, clientY: 10 }) as PointerEvent;
    return { host, drag, start };
}

describe("pastThreshold", () => {
    it("starts a drag only after 4 px of movement", () => {
        expect(pastThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
        expect(pastThreshold({ x: 0, y: 0 }, { x: 2.8, y: 2.8 })).toBe(false);
        expect(pastThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
        expect(pastThreshold({ x: 0, y: 0 }, { x: 0, y: -5 })).toBe(true);
    });
});

describe("isCopy", () => {
    it("copies items when Ctrl or Alt is held", () => {
        const items: DragPayload = { kind: "items", refs: [{ category: 0, index: 0 }] };
        expect(isCopy(items, { ctrlKey: true, altKey: false })).toBe(true);
        expect(isCopy(items, { ctrlKey: false, altKey: true })).toBe(true);
        expect(isCopy(items, { ctrlKey: false, altKey: false })).toBe(false);
    });

    it("never copies a category or a new item", () => {
        expect(isCopy({ kind: "category", index: 0 }, { ctrlKey: true, altKey: true })).toBe(false);
        expect(isCopy({ kind: "new", abilityIds: [1] }, { ctrlKey: true, altKey: true })).toBe(false);
    });
});

describe("dispatchDrop", () => {
    const state: DragState = { payload: { kind: "category", index: 0 }, x: 0, y: 0, copy: false };

    it("stops at the first handler that takes the drop", () => {
        const a = vi.fn(() => false);
        const b = vi.fn(() => true);
        const c = vi.fn(() => true);
        expect(dispatchDrop([a, b, c], state)).toBe(true);
        expect(a).toHaveBeenCalledWith(state);
        expect(b).toHaveBeenCalledWith(state);
        expect(c).not.toHaveBeenCalled();
    });

    it("reports a drop nobody took", () => {
        expect(dispatchDrop([() => false], state)).toBe(false);
    });
});

describe("drag", () => {
    it("stays a click under the threshold and drops nothing", () => {
        const { host, drag, start } = setup();
        const handler = vi.fn(() => true);
        drag.onDrop(handler);
        drag.begin({ kind: "category", index: 1 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 12, clientY: 11 }));
        expect(drag.current).toBeNull();
        host.dispatchEvent(pointer("pointerup", { clientX: 12, clientY: 11 }));
        expect(handler).not.toHaveBeenCalled();
    });

    it("follows the pointer once past the threshold and hands the drop to a target", () => {
        const { host, drag, start } = setup();
        const handler = vi.fn(() => true);
        drag.onDrop(handler);
        drag.begin({ kind: "new", abilityIds: [7] }, start, { label: "Extra Spirit" });
        host.dispatchEvent(pointer("pointermove", { clientX: 20, clientY: 10 }));
        expect(drag.current).toMatchObject({ x: 20, y: 10, copy: false, preview: { label: "Extra Spirit" } });
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 40 }));
        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({ payload: { kind: "new", abilityIds: [7] }, x: 30, y: 40 }),
        );
        expect(drag.current).toBeNull();
    });

    it("copies items when Ctrl is held at the drop", () => {
        const { host, drag, start } = setup();
        const handler = vi.fn((_: DragState) => true);
        drag.onDrop(handler);
        drag.begin({ kind: "items", refs: [{ category: 0, index: 2 }] }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10, ctrlKey: true }));
        expect(handler.mock.calls[0]![0].copy).toBe(true);
    });

    it("shows copy as soon as the modifier goes down mid-drag", () => {
        const { host, drag, start } = setup();
        drag.begin({ kind: "items", refs: [{ category: 0, index: 2 }] }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(key("keydown", { key: "Alt", altKey: true }));
        expect(drag.current?.copy).toBe(true);
    });

    it("cancels on Escape without dropping", () => {
        const { host, drag, start } = setup();
        const handler = vi.fn(() => true);
        drag.onDrop(handler);
        drag.begin({ kind: "category", index: 0 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        const escape = key("keydown", { key: "Escape" });
        host.dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(true);
        expect(drag.current).toBeNull();
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10 }));
        expect(handler).not.toHaveBeenCalled();
    });

    it("ignores a button other than the primary one", () => {
        const { host, drag } = setup();
        drag.begin({ kind: "category", index: 0 }, pointer("pointerdown", { button: 2 }) as PointerEvent);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        expect(drag.current).toBeNull();
    });

    it("stops calling a target once it unregisters", () => {
        const { host, drag, start } = setup();
        const handler = vi.fn(() => true);
        const off = drag.onDrop(handler);
        off();
        drag.begin({ kind: "category", index: 0 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10 }));
        expect(handler).not.toHaveBeenCalled();
    });

    it("swallows the click that follows a drop", () => {
        const { host, drag, start } = setup();
        drag.begin({ kind: "category", index: 0 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10 }));
        const click = Object.assign(new Event("click", { cancelable: true }), {});
        host.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
    });

    it("swallows the click that follows the release of a drag cancelled with Escape", () => {
        const { host, drag, start } = setup();
        drag.begin({ kind: "category", index: 0 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(key("keydown", { key: "Escape" }));
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10 }));
        const click = new Event("click", { cancelable: true });
        host.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
    });

    it("lets a later click through after an Escape-cancelled drag is released", () => {
        const { host, drag, start } = setup();
        drag.begin({ kind: "category", index: 0 }, start);
        host.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(key("keydown", { key: "Escape" }));
        host.dispatchEvent(pointer("pointerup", { clientX: 30, clientY: 10 }));
        host.dispatchEvent(new Event("click", { cancelable: true }));
        const later = new Event("click", { cancelable: true });
        host.dispatchEvent(later);
        expect(later.defaultPrevented).toBe(false);
    });
});
