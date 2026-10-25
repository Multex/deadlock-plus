import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ExportFooter from "./export-footer.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();

/** Splits the markup at the opening tags of the brand and site elements. */
function parts(label = "Made with"): { brand: string; site: string } {
    const body = render(ExportFooter, { props: { label } }).body;
    const start = (name: string) => body.lastIndexOf("<", body.indexOf(`class="${name}`));
    const brand = start("brand");
    const site = start("site");
    expect(brand).toBeGreaterThan(-1);
    expect(site).toBeGreaterThan(brand);
    return { brand: body.slice(brand, site), site: body.slice(site) };
}

describe("ExportFooter", () => {
    it("puts the brand mark and wordmark on the left and the site on the right", () => {
        const { brand } = parts();
        expect(brand).toMatch(/<img\b/);
        expect(text(brand)).toContain("Deadlock+");
    });

    it("shows the site without its scheme", () => {
        const { site } = parts();
        expect(text(site)).toBe("deadlockplus.app");
        expect(site).not.toContain("https://");
    });

    it("leads the brand with the label", () => {
        expect(text(parts("Erstellt mit").brand).startsWith("Erstellt mit")).toBe(true);
    });
});
