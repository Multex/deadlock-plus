import { describe, expect, it, vi } from "vitest";
import {
    EXPORT_PIXEL_RATIO,
    EXPORT_IGNORE_ATTR,
    EXPORT_WIDTH,
    MAX_EXPORT_SIDE,
    exportFileName,
    exportPixelRatio,
    runExport,
    stripExportIgnored,
    type ExportDeps,
} from "./export";

const date = new Date(2026, 9, 10, 18, 30);

describe("exportFileName", () => {
    it("joins hero, result, match id and date", () => {
        expect(exportFileName({ heroName: "Lady Geist", outcome: "win", matchId: 12345, date })).toBe(
            "deadlock-plus-lady-geist-win-12345-2026-10-10.png",
        );
    });

    it("leaves out an unknown hero and an unscored result", () => {
        expect(exportFileName({ heroName: null, outcome: null, matchId: 7, date })).toBe(
            "deadlock-plus-match-7-2026-10-10.png",
        );
    });

    it("keeps names ASCII and free of path characters", () => {
        const name = exportFileName({ heroName: "Mo & Krill / Dr. Ünïcode", outcome: "loss", matchId: 1, date });
        expect(name).toMatch(/^[a-z0-9.-]+$/);
        expect(name).toBe("deadlock-plus-mo-krill-dr-unicode-loss-1-2026-10-10.png");
    });

    it("never exceeds the save dialog's name limit", () => {
        const name = exportFileName({ heroName: "x".repeat(300), outcome: "win", matchId: 99, date });
        expect(name.length).toBeLessThanOrEqual(100);
        expect(name.endsWith("-win-99-2026-10-10.png")).toBe(true);
    });

    it("pads month and day", () => {
        const name = exportFileName({ heroName: "Haze", outcome: null, matchId: 5, date: new Date(2026, 0, 2) });
        expect(name).toBe("deadlock-plus-haze-5-2026-01-02.png");
    });
});

describe("exportPixelRatio", () => {
    it("uses 2x at the fixed width", () => {
        expect(EXPORT_WIDTH).toBe(1200);
        expect(EXPORT_PIXEL_RATIO).toBe(2);
        expect(exportPixelRatio(EXPORT_WIDTH, 800)).toBe(2);
    });

    it("scales down so the longest side stays within the canvas limit", () => {
        const ratio = exportPixelRatio(EXPORT_WIDTH, 5000);
        expect(ratio).toBeLessThan(2);
        expect(5000 * ratio).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
    });

    it("never returns less than 1", () => {
        expect(exportPixelRatio(EXPORT_WIDTH, 100000)).toBe(1);
    });
});

function deps(over: Partial<ExportDeps> = {}): ExportDeps {
    return {
        render: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
        save: vi.fn().mockResolvedValue(true),
        copy: vi.fn().mockResolvedValue(undefined),
        hasFocus: vi.fn().mockReturnValue(true),
        waitForFocus: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function focusError(): DOMException {
    return new DOMException("Document is not focused.", "NotAllowedError");
}

describe("runExport focus handling", () => {
    it("waits for focus before copying when the document is unfocused after render", async () => {
        const order: string[] = [];
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const d = deps({
            hasFocus: vi.fn().mockReturnValue(false),
            waitForFocus: vi.fn().mockImplementation(async () => {
                order.push("wait");
                await gate;
                order.push("focused");
            }),
            copy: vi.fn().mockImplementation(async () => {
                order.push("copy");
            }),
        });
        const pending = runExport("copy", "a.png", d);
        await Promise.resolve();
        await Promise.resolve();
        expect(d.copy).not.toHaveBeenCalled();
        release();
        expect(await pending).toEqual({ status: "copied" });
        expect(order).toEqual(["wait", "focused", "copy"]);
        expect(d.render).toHaveBeenCalledTimes(1);
    });

    it("does not wait when the document already has focus", async () => {
        const d = deps();
        await runExport("copy", "a.png", d);
        expect(d.waitForFocus).not.toHaveBeenCalled();
    });

    it("retries once after focus when the write is rejected for focus, without re-rendering", async () => {
        const copy = vi.fn().mockRejectedValueOnce(focusError()).mockResolvedValueOnce(undefined);
        const d = deps({ copy });
        expect(await runExport("copy", "a.png", d)).toEqual({ status: "copied" });
        expect(copy).toHaveBeenCalledTimes(2);
        expect(d.waitForFocus).toHaveBeenCalledTimes(1);
        expect(d.render).toHaveBeenCalledTimes(1);
        expect(copy.mock.calls[1][0]).toBe(copy.mock.calls[0][0]);
    });

    it("recognises a focus rejection by message when the error is not a DOMException", async () => {
        const copy = vi
            .fn()
            .mockRejectedValueOnce(new Error("Failed to execute 'write' on 'Clipboard': Document is not focused."))
            .mockResolvedValueOnce(undefined);
        expect(await runExport("copy", "a.png", deps({ copy }))).toEqual({ status: "copied" });
        expect(copy).toHaveBeenCalledTimes(2);
    });

    it("retries only once", async () => {
        const copy = vi.fn().mockRejectedValue(focusError());
        const d = deps({ copy });
        const result = await runExport("copy", "a.png", d);
        expect(result.status).toBe("failed");
        expect(copy).toHaveBeenCalledTimes(2);
        expect(d.render).toHaveBeenCalledTimes(1);
    });

    it("fails without retrying on a non-focus error", async () => {
        const boom = new Error("encoder");
        const d = deps({ copy: vi.fn().mockRejectedValue(boom) });
        expect(await runExport("copy", "a.png", d)).toEqual({ status: "failed", error: boom });
        expect(d.copy).toHaveBeenCalledTimes(1);
        expect(d.waitForFocus).not.toHaveBeenCalled();
    });

    it("leaves save unaffected by focus", async () => {
        const d = deps({ hasFocus: vi.fn().mockReturnValue(false) });
        expect(await runExport("save", "a.png", d)).toEqual({ status: "saved" });
        expect(d.waitForFocus).not.toHaveBeenCalled();
        expect(d.hasFocus).not.toHaveBeenCalled();
    });
});

describe("runExport", () => {
    it("saves the rendered image under the given name", async () => {
        const d = deps();
        expect(await runExport("save", "a.png", d)).toEqual({ status: "saved" });
        expect(d.save).toHaveBeenCalledWith("a.png", expect.any(Blob));
        expect(d.copy).not.toHaveBeenCalled();
    });

    it("reports a cancelled dialog", async () => {
        const d = deps({ save: vi.fn().mockResolvedValue(false) });
        expect(await runExport("save", "a.png", d)).toEqual({ status: "cancelled" });
    });

    it("copies the rendered image", async () => {
        const d = deps();
        expect(await runExport("copy", "a.png", d)).toEqual({ status: "copied" });
        expect(d.copy).toHaveBeenCalledWith(expect.any(Blob));
    });

    it("turns a render failure into a failed result instead of throwing", async () => {
        const boom = new Error("render");
        const d = deps({ render: vi.fn().mockRejectedValue(boom) });
        expect(await runExport("copy", "a.png", d)).toEqual({ status: "failed", error: boom });
        expect(d.copy).not.toHaveBeenCalled();
    });

    it("turns a save or copy failure into a failed result", async () => {
        const boom = new Error("disk");
        const s = deps({ save: vi.fn().mockRejectedValue(boom) });
        expect(await runExport("save", "a.png", s)).toEqual({ status: "failed", error: boom });
        const c = deps({ copy: vi.fn().mockRejectedValue(boom) });
        expect(await runExport("copy", "a.png", c)).toEqual({ status: "failed", error: boom });
    });
});

describe("stripExportIgnored", () => {
    function fakeRoot(selectors: string[]) {
        const removed: string[] = [];
        const root = {
            querySelectorAll(selector: string) {
                return selector === `[${EXPORT_IGNORE_ATTR}]`
                    ? selectors.map((name) => ({ remove: () => removed.push(name) }))
                    : [];
            },
        };
        return { root, removed };
    }

    it("marks ignored nodes with the attribute the live controls already use", () => {
        expect(EXPORT_IGNORE_ATTR).toBe("data-export-ignore");
    });

    it("removes every ignored node, such as the versus-average marks, and reports the count", () => {
        const { root, removed } = fakeRoot(["versus-kills", "versus-souls", "controls"]);
        expect(stripExportIgnored(root)).toBe(3);
        expect(removed).toEqual(["versus-kills", "versus-souls", "controls"]);
    });

    it("does nothing when nothing is marked", () => {
        const { root, removed } = fakeRoot([]);
        expect(stripExportIgnored(root)).toBe(0);
        expect(removed).toEqual([]);
    });
});
