import { describe, expect, it, vi } from "vitest";

vi.mock("./components/detail/export-footer.svelte", () => ({ default: {} }));

import { t } from "$lib/core/i18n.svelte";
import { MAX_EXPORT_SIDE } from "@deadlock-plus/match/export";
import { ExportRenderError, exportFailureText, resolveRenderFrame } from "./export-dom";

describe("resolveRenderFrame", () => {
    it("keeps the footer and the measured height by default", () => {
        expect(resolveRenderFrame(1200, 840)).toEqual({ width: 1200, height: 840, footer: true, pixelRatio: 2 });
    });

    it("skips the footer when asked", () => {
        expect(resolveRenderFrame(1200, 840, { footer: false }).footer).toBe(false);
    });

    it("uses the fixed height instead of the measured one", () => {
        const frame = resolveRenderFrame(1080, 3000, { footer: false, height: 1920 });
        expect(frame).toMatchObject({ width: 1080, height: 1920, footer: false });
    });

    it("rounds a fractional fixed height", () => {
        expect(resolveRenderFrame(1080, 3000, { height: 607.5 }).height).toBe(608);
    });

    it("ignores a non-positive fixed height", () => {
        expect(resolveRenderFrame(1080, 700, { height: 0 }).height).toBe(700);
    });

    it("caps a fixed height at the canvas limit", () => {
        const frame = resolveRenderFrame(1080, 100, { height: MAX_EXPORT_SIDE * 2 });
        expect(frame.height).toBe(MAX_EXPORT_SIDE);
        expect(frame.pixelRatio).toBe(1);
    });

    it("keeps a measured height as it is, however tall", () => {
        expect(resolveRenderFrame(1200, MAX_EXPORT_SIDE + 500).height).toBe(MAX_EXPORT_SIDE + 500);
    });

    it("lowers the pixel ratio for a tall fixed frame", () => {
        const frame = resolveRenderFrame(1080, 100, { height: 6000 });
        expect(frame.pixelRatio).toBeLessThan(2);
        expect(6000 * frame.pixelRatio).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
    });
});

describe("exportFailureText", () => {
    it("says the image could not be made, without wrapping or raw text", () => {
        const text = exportFailureText("save", new ExportRenderError(new Error("canvas too large")));
        expect(text).toBe(t("match_history.detail.export.render_failed"));
        expect(text).not.toContain("canvas");
        expect(exportFailureText("copy", new ExportRenderError(null))).toBe(
            t("match_history.detail.export.render_failed"),
        );
    });

    it("keeps the save and copy messages for later steps", () => {
        expect(exportFailureText("save", "disk full")).toBe(
            t("match_history.detail.export.save_failed", { error: "disk full" }),
        );
        expect(exportFailureText("copy", "denied")).toBe(
            t("match_history.detail.export.copy_failed", { error: "denied" }),
        );
    });
});
