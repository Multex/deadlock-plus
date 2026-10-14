import { describe, expect, it, vi } from "vitest";

vi.mock("./components/detail/export-footer.svelte", () => ({ default: {} }));

import { t } from "$lib/core/i18n.svelte";
import { ExportRenderError, exportFailureText } from "./export-dom";

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
