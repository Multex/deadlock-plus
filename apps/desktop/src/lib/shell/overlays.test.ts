import { describe, expect, it, vi } from "vitest";
import { createOverlays } from "./overlays";

describe("overlays", () => {
    it("closeAll calls every registered close", () => {
        const overlays = createOverlays();
        const a = vi.fn();
        const b = vi.fn();
        overlays.register(a);
        overlays.register(b);
        overlays.closeAll();
        expect(a).toHaveBeenCalledOnce();
        expect(b).toHaveBeenCalledOnce();
    });

    it("an unregistered close is not called", () => {
        const overlays = createOverlays();
        const a = vi.fn();
        const stop = overlays.register(a);
        stop();
        overlays.closeAll();
        expect(a).not.toHaveBeenCalled();
    });

    it("closers that unregister themselves while closing do not skip others", () => {
        const overlays = createOverlays();
        const b = vi.fn();
        const stopA = overlays.register(() => stopA());
        overlays.register(b);
        overlays.closeAll();
        expect(b).toHaveBeenCalledOnce();
        expect(overlays.size).toBe(1);
    });

    it("registering the same close twice keeps two entries until each is removed", () => {
        const overlays = createOverlays();
        const a = vi.fn();
        const stop1 = overlays.register(a);
        overlays.register(a);
        stop1();
        overlays.closeAll();
        expect(a).toHaveBeenCalledOnce();
    });

    it("closeAll is safe to repeat", () => {
        const overlays = createOverlays();
        const a = vi.fn();
        overlays.register(a);
        overlays.closeAll();
        overlays.closeAll();
        expect(a).toHaveBeenCalledTimes(2);
    });
});

describe("snapshot", () => {
    it("closes only the overlays open when it was taken", () => {
        const overlays = createOverlays();
        const before = vi.fn();
        const after = vi.fn();
        overlays.register(before);
        const closeOpen = overlays.snapshot();
        overlays.register(after);
        closeOpen();
        expect(before).toHaveBeenCalledOnce();
        expect(after).not.toHaveBeenCalled();
    });

    it("skips an overlay that closed in between", () => {
        const overlays = createOverlays();
        const a = vi.fn();
        const stop = overlays.register(a);
        const closeOpen = overlays.snapshot();
        stop();
        closeOpen();
        expect(a).not.toHaveBeenCalled();
    });
});
