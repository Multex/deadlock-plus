import type { ItemRef } from "./document";

export type DragPayload =
    { kind: "new"; abilityIds: number[] } | { kind: "items"; refs: ItemRef[] } | { kind: "category"; index: number };

export interface DragState {
    payload: DragPayload;
    x: number;
    y: number;
    copy: boolean;
    preview?: { art?: string; label: string };
}

type DropHandler = (state: DragState) => boolean;
type Point = { x: number; y: number };
type Keys = { ctrlKey: boolean; altKey: boolean };

const THRESHOLD = 4;

export function pastThreshold(start: Point, point: Point): boolean {
    return Math.hypot(point.x - start.x, point.y - start.y) >= THRESHOLD;
}

export function isCopy(payload: DragPayload, keys: Keys): boolean {
    return payload.kind === "items" && (keys.ctrlKey || keys.altKey);
}

export function dispatchDrop(handlers: readonly DropHandler[], state: DragState): boolean {
    return handlers.some((handler) => handler(state));
}

interface Pending {
    payload: DragPayload;
    start: Point;
    preview?: DragState["preview"];
}

/**
 * Pointer-event drag and drop on `host` (the window). HTML5 drag and drop is not used: Tauri's window
 * drag-drop handler swallows it on Windows.
 */
export function createDrag(host: () => EventTarget) {
    let current = $state<DragState | null>(null);
    let pending: Pending | null = null;
    const handlers: DropHandler[] = [];

    const listeners: [string, (event: Event) => void, boolean][] = [
        ["pointermove", (event) => move(event as PointerEvent), false],
        ["pointerup", (event) => up(event as PointerEvent), false],
        ["pointercancel", () => cancel(), false],
        ["keydown", (event) => keys(event as KeyboardEvent), true],
        ["keyup", (event) => keys(event as KeyboardEvent), true],
    ];

    function listen() {
        const target = host();
        for (const [type, fn, capture] of listeners) target.addEventListener(type, fn, capture);
    }

    function unlisten() {
        const target = host();
        for (const [type, fn, capture] of listeners) target.removeEventListener(type, fn, capture);
    }

    function setCursor(value: string) {
        if (typeof document !== "undefined") document.documentElement.style.cursor = value;
    }

    function move(event: PointerEvent) {
        if (!pending) return;
        const point = { x: event.clientX, y: event.clientY };
        if (!current && !pastThreshold(pending.start, point)) return;
        if (!current) setCursor("grabbing");
        current = {
            payload: pending.payload,
            ...point,
            copy: isCopy(pending.payload, event),
            preview: pending.preview,
        };
    }

    function up(event: PointerEvent) {
        const state = current && {
            ...current,
            x: event.clientX,
            y: event.clientY,
            copy: isCopy(current.payload, event),
        };
        end();
        if (!state) return;
        dispatchDrop([...handlers], state);
        swallowClick();
    }

    // The click that follows a drop lands on whatever sat under the pointer; it must not select or open it.
    function swallowClick() {
        const target = host();
        const swallow = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        target.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => target.removeEventListener("click", swallow, { capture: true }), 0);
    }

    function keys(event: KeyboardEvent) {
        if (!current) return;
        if (event.type === "keydown" && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
            return;
        }
        if (event.key === "Alt") event.preventDefault();
        current = { ...current, copy: isCopy(current.payload, event) };
    }

    function end() {
        if (current) setCursor("");
        pending = null;
        current = null;
        unlisten();
    }

    function cancel() {
        end();
    }

    return {
        get current(): DragState | null {
            return current;
        },
        /** Call from pointerdown; becomes a drag after 4 px of movement, else nothing happens (the click still fires). */
        begin(payload: DragPayload, event: PointerEvent, preview?: DragState["preview"]) {
            if (event.button !== 0) return;
            end();
            pending = { payload, start: { x: event.clientX, y: event.clientY }, preview };
            listen();
        },
        /** Drop targets: return true when handled. Called on pointerup over the target. */
        onDrop(handler: DropHandler): () => void {
            handlers.push(handler);
            return () => {
                const at = handlers.indexOf(handler);
                if (at >= 0) handlers.splice(at, 1);
            };
        },
        cancel,
    };
}

export const drag = createDrag(() => window);
