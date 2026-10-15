import { describe, expect, it } from "vitest";
import { CATEGORIES, ITEMS, itemsFor, matchingItems, matchingCategories } from "./catalog";

describe("catalog", () => {
    it("assigns every item to a known category", () => {
        const ids = new Set(CATEGORIES.map((c) => c.id));
        for (const item of ITEMS) expect(ids.has(item.category)).toBe(true);
    });

    it("titles the autostart item for the given platform", () => {
        const title = (p: "windows" | "macos" | "linux") => itemsFor(p).find((i) => i.id === "autostart")?.title;
        expect(title("windows")).toBe("Start with Windows");
        expect(title("macos")).toBe("Start with macOS");
        expect(title("linux")).toBe("Start at login");
    });

    it("gives language its own category, after appearance", () => {
        const ids = CATEGORIES.map((c) => c.id);
        expect(ITEMS.find((i) => i.id === "language")?.category).toBe("language");
        expect(ids.indexOf("language")).toBe(ids.indexOf("appearance") + 1);
    });

    it("orders the categories as laid out in the settings page", () => {
        expect(CATEGORIES.map((c) => c.id)).toEqual([
            "appearance",
            "language",
            "startup",
            "notifications",
            "privacy",
            "sharing",
            "storage",
            "diagnostics",
            "about",
        ]);
    });

    it("files items under the merged categories", () => {
        const cat = (id: string) => ITEMS.find((i) => i.id === id)?.category;
        expect(cat("match-ingest")).toBe("sharing");
        expect(cat("gc-recovery")).toBe("sharing");
        expect(cat("storage")).toBe("storage");
        expect(cat("thanks")).toBe("about");
        expect(cat("licenses")).toBe("about");
    });

    it("has unique item ids", () => {
        expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    });

    it("matches nothing-filtered for an empty query", () => {
        expect(matchingItems("")).toBeNull();
        expect(matchingItems("   ")).toBeNull();
    });

    it("matches on the title, case-insensitively", () => {
        expect(matchingItems("ACCESSIBLE")?.has("accessible-font")).toBe(true);
    });

    it("matches on keywords that are not in the title", () => {
        expect(matchingItems("dyslexia")?.has("accessible-font")).toBe(true);
        expect(matchingItems("sign in")?.has("autostart")).toBe(true);
    });

    it("finds the background work setting by the tasks it covers", () => {
        expect(matchingItems("scan addons at launch")?.has("background-jobs")).toBe(true);
        expect(matchingItems("index patch notes automatically")?.has("background-jobs")).toBe(true);
        expect(matchingItems("pause game running")?.has("background-jobs")).toBe(true);
    });

    it("no longer lists the launch scan and indexing switches on their own", () => {
        const ids = ITEMS.map((i) => i.id);
        expect(ids).not.toContain("auto-scan-addons");
        expect(ids).not.toContain("auto-index-patch-notes");
    });

    it("finds About when searching for a way to support the app", () => {
        const about = (query: string) => matchingCategories(matchingItems(query)).includes("about");
        expect(about("support")).toBe(true);
        expect(about("donate")).toBe(true);
        expect(about("ko-fi")).toBe(true);
    });

    it("requires every word to match", () => {
        expect(matchingItems("tray quit")?.has("close-to-tray")).toBe(true);
        expect(matchingItems("tray zzzz")?.size).toBe(0);
    });

    it("lists categories that have a match, in catalog order", () => {
        const ids = matchingCategories(matchingItems("steam"));
        expect(ids).toContain("notifications");
        expect(ids).toEqual(CATEGORIES.map((c) => c.id).filter((id) => ids.includes(id)));
    });

    it("lists every category when there is no filter", () => {
        expect(matchingCategories(null)).toEqual(CATEGORIES.map((c) => c.id));
    });

    it("finds diagnostics by support and crash words", () => {
        expect(matchingItems("support report")?.has("diagnostics")).toBe(true);
        expect(matchingItems("support report")?.has("version")).toBe(false);
        expect(matchingItems("crash")?.has("diagnostics")).toBe(true);
        expect(matchingItems("donate ko-fi")?.has("version")).toBe(true);
    });

    it("does not find match sharing by telemetry", () => {
        expect(matchingItems("telemetry")?.has("match-ingest")).toBe(false);
        expect(matchingItems("telemetry")?.has("telemetry")).toBe(true);
        expect(matchingItems("salts")?.has("gc-recovery")).toBe(false);
    });

    it("finds match sharing by plain words", () => {
        for (const id of ["match-ingest", "gc-recovery"]) {
            expect(matchingItems("share matches community stats")?.has(id)).toBe(true);
            expect(matchingItems("match details missing replay")?.has(id)).toBe(true);
        }
    });

    it("finds items by their added keywords", () => {
        expect(matchingItems("firewall server block region")?.has("background-jobs")).toBe(true);
        expect(matchingItems("nightshift deadlock api oled black")?.has("theme")).toBe(true);
        expect(matchingItems("gpl copyright trademark valve disclaimer")?.has("licenses")).toBe(true);
        expect(matchingItems("space cache clear")?.has("storage")).toBe(true);
    });

    it("matches on the category label", () => {
        expect(matchingItems("match sharing")?.has("match-ingest")).toBe(true);
        expect(matchingItems("startup and background")?.has("close-to-tray")).toBe(true);
    });

    it("matches on the description text", () => {
        expect(matchingItems("atkinson hyperlegible")?.has("accessible-font")).toBe(true);
        expect(matchingItems("weekly maintenance")?.has("maintenance")).toBe(true);
        expect(matchingItems("sign in to steam as you")?.has("gc-recovery")).toBe(true);
    });

    it("gives descriptions only where a description key exists", () => {
        const d = (id: string) => ITEMS.find((i) => i.id === id)?.description;
        expect(d("theme")).toBe("Pick the colours the app uses.");
        expect(d("version")).toBeUndefined();
        expect(d("thanks")).toBeUndefined();
        expect(itemsFor("windows").find((i) => i.id === "autostart")?.description).toContain("Windows");
        expect(itemsFor("linux").find((i) => i.id === "autostart")?.description).toContain("desktop");
    });
});
