import { describe, expect, it } from "vitest";
import { CATEGORIES, ITEMS, categoriesFor, hasOverlay, itemsFor, matchingItems, matchingCategories } from "./catalog";

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
            "overlay",
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

    it("finds the update channel by the words people search for", () => {
        for (const words of ["beta", "nightly", "channel", "prerelease", "early access"])
            expect(matchingItems(words)?.has("updates"), words).toBe(true);
    });

    it("finds the UI scale by the words people search for", () => {
        expect(matchingItems("zoom")?.has("ui-scale")).toBe(true);
        expect(matchingItems("text size")?.has("ui-scale")).toBe(true);
        expect(ITEMS.find((i) => i.id === "ui-scale")?.category).toBe("appearance");
    });

    it("finds hardware acceleration by GPU and lag", () => {
        expect(itemsFor("windows").some((i) => i.id === "hardware-acceleration")).toBe(true);
        expect(matchingItems("gpu")?.has("hardware-acceleration")).toBe(true);
        expect(matchingItems("stutter")?.has("hardware-acceleration")).toBe(true);
    });

    it("lists hardware acceleration on Windows and Linux", () => {
        expect(itemsFor("linux").some((i) => i.id === "hardware-acceleration")).toBe(true);
        expect(itemsFor("macos").some((i) => i.id === "hardware-acceleration")).toBe(false);
    });

    it("finds opening the window with the game under startup", () => {
        expect(ITEMS.find((i) => i.id === "open-on-game-start")?.category).toBe("startup");
        expect(matchingItems("game launch")?.has("open-on-game-start")).toBe(true);
        expect(matchingItems("deadlock starts")?.has("open-on-game-start")).toBe(true);
    });

    it("lists opening with the game right after the tray setting", () => {
        const ids = ITEMS.map((i) => i.id);
        expect(ids.indexOf("open-on-game-start")).toBe(ids.indexOf("close-to-tray") + 1);
    });

    it("finds the front page after each match under notifications", () => {
        const item = ITEMS.find((i) => i.id === "front-page-after-match");
        expect(item?.category).toBe("notifications");
        expect(item?.title).toBe("Front page after each match");
        expect(matchingItems("newspaper")?.has("front-page-after-match")).toBe(true);
        expect(matchingItems("after match")?.has("front-page-after-match")).toBe(true);
    });

    it("lists the front page's overlay alert right after it, only where there is an overlay", () => {
        const ids = (p: "windows" | "linux") => itemsFor(p).map((i) => i.id);
        expect(ids("windows").indexOf("front-page-overlay-alert")).toBe(
            ids("windows").indexOf("front-page-after-match") + 1,
        );
        expect(ids("linux")).not.toContain("front-page-overlay-alert");
        expect(matchingItems("front page waiting")?.has("front-page-overlay-alert")).toBe(true);
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

    it("finds the theme effects switch by what the effects are", () => {
        expect(matchingItems("snow")?.has("theme-effects")).toBe(true);
        expect(matchingItems("background animation")?.has("theme-effects")).toBe(true);
    });

    it("finds each new theme by name", () => {
        expect(matchingItems("statlocker")?.has("theme")).toBe(true);
        expect(matchingItems("flint snow")?.has("theme")).toBe(true);
        expect(matchingItems("pretty in pink")?.has("theme")).toBe(true);
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

    it("files the overlay controls under their own category and finds them by keyword", () => {
        const ids = ["overlay", "overlay-position", "overlay-duration", "overlay-test"];
        for (const id of ids) expect(ITEMS.find((i) => i.id === id)?.category).toBe("overlay");
        expect(ITEMS.find((i) => i.id === "match-found")?.category).toBe("notifications");
        for (const id of [...ids, "match-found"]) expect(matchingItems("overlay")?.has(id)).toBe(true);
        expect(matchingItems("in game toast")?.has("overlay")).toBe(true);
        expect(matchingItems("corner")?.has("overlay-position")).toBe(true);
        expect(matchingItems("seconds")?.has("overlay-duration")).toBe(true);
        expect(matchingItems("preview")?.has("overlay-test")).toBe(true);
        expect(matchingItems("queue pop")?.has("match-found")).toBe(true);
    });

    it("lists every notification type under notifications, in page order", () => {
        expect(ITEMS.filter((i) => i.category === "notifications").map((i) => i.id)).toEqual([
            "update-alerts",
            "maintenance",
            "server-blocks-updated",
            "server-blocks-stale",
            "break-reminder",
            "dispatch-alerts",
            "front-page-after-match",
            "front-page-overlay-alert",
            "match-found",
            "queue-stopped",
        ]);
        expect(ITEMS.map((i) => i.id)).not.toContain("overlay-match-found");
    });

    it("titles and describes the new notification types", () => {
        const item = (id: string) => ITEMS.find((i) => i.id === id);
        expect(item("server-blocks-updated")?.title).toBe("Server blocks updated");
        expect(item("server-blocks-stale")?.title).toBe("Server blocks out of date");
        expect(item("break-reminder")?.title).toBe("Break reminder");
        expect(item("break-reminder")?.description).toContain("losses in a row");
        expect(item("queue-stopped")?.title).toBe("Queue stopped");
        expect(item("queue-stopped")?.description).toContain("without a match");
    });

    it("finds every notification type with a delivery choice by how it shows", () => {
        const noDelivery = ["match-found", "queue-stopped", "front-page-after-match", "front-page-overlay-alert"];
        const ids = ITEMS.filter((i) => i.category === "notifications" && !noDelivery.includes(i.id)).map((i) => i.id);
        for (const query of ["shows as", "desktop notification", "notification center", "overlay", "popup"]) {
            for (const id of ids) expect(matchingItems(query)?.has(id), `${query} -> ${id}`).toBe(true);
        }
    });

    it("does not find match found or queue stopped by deliveries they cannot use", () => {
        for (const query of ["shows as", "desktop notification", "notification center"]) {
            expect(matchingItems(query)?.has("match-found"), query).toBe(false);
            expect(matchingItems(query)?.has("queue-stopped"), query).toBe(false);
        }
    });

    it("finds queue stopped by what it is about", () => {
        for (const query of ["queue", "cancel", "party leader", "overlay"]) {
            expect(matchingItems(query)?.has("queue-stopped"), query).toBe(true);
        }
    });

    it("has the game overlay on Windows only", () => {
        expect(hasOverlay("windows")).toBe(true);
        expect(hasOverlay("linux")).toBe(false);
        expect(hasOverlay("macos")).toBe(false);
    });

    it("hides match found, queue stopped and the game overlay section where there is no overlay", () => {
        const overlayIds = [
            "match-found",
            "queue-stopped",
            "overlay",
            "overlay-position",
            "overlay-duration",
            "overlay-test",
        ];
        const ids = (p: "windows" | "linux") => itemsFor(p).map((i) => i.id);
        for (const id of overlayIds) {
            expect(ids("windows"), id).toContain(id);
            expect(ids("linux"), id).not.toContain(id);
        }
        expect(matchingCategories(null, itemsFor("linux"))).toEqual(
            CATEGORIES.map((c) => c.id).filter((id) => id !== "overlay"),
        );
        expect(matchingCategories(null, itemsFor("windows"))).toEqual(CATEGORIES.map((c) => c.id));
    });

    it("offers the game overlay category on Windows only", () => {
        const ids = (p: "windows" | "linux" | "macos") => categoriesFor(p).map((c) => c.id);
        expect(ids("windows")).toEqual(CATEGORIES.map((c) => c.id));
        expect(ids("linux")).toEqual(CATEGORIES.map((c) => c.id).filter((id) => id !== "overlay"));
        expect(ids("macos")).not.toContain("overlay");
    });

    it("lists admin access under startup, right after starting with the system, on Windows only", () => {
        const ids = (p: "windows" | "linux" | "macos") => itemsFor(p).map((i) => i.id);
        expect(ids("windows").indexOf("admin-access")).toBe(ids("windows").indexOf("autostart") + 1);
        expect(itemsFor("windows").find((i) => i.id === "admin-access")?.category).toBe("startup");
        expect(ids("linux")).not.toContain("admin-access");
        expect(ids("macos")).not.toContain("admin-access");
    });

    it("finds admin access by the words people search for", () => {
        for (const query of ["admin", "administrator", "uac", "firewall", "frame times", "always allow"]) {
            expect(matchingItems(query)?.has("admin-access"), query).toBe(true);
        }
    });

    it("leaves a row the app hides out of the search results", () => {
        const hidden = (id: string) => id === "admin-access";
        expect(matchingItems("admin", hidden)?.has("admin-access")).toBe(false);
        expect(matchingItems("tray", hidden)?.has("close-to-tray")).toBe(true);
        expect(matchingCategories(matchingItems("uac", hidden))).toEqual([]);
    });

    it("matches on the category label", () => {
        expect(matchingItems("match sharing")?.has("match-ingest")).toBe(true);
        expect(matchingItems("startup and background")?.has("close-to-tray")).toBe(true);
    });

    it("matches on the description text", () => {
        expect(matchingItems("atkinson hyperlegible")?.has("accessible-font")).toBe(true);
        expect(matchingItems("weekly maintenance")?.has("maintenance")).toBe(true);
        expect(matchingItems("yours and other players")?.has("gc-recovery")).toBe(true);
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
