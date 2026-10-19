import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemsFor } from "./catalog";
import { highlightStep, jumpToSetting, settingPath } from "./jump";
import { settingsUi } from "./ui.svelte";

describe("settingPath", () => {
    it("points at the category page that holds the row", () => {
        expect(settingPath("match-found", itemsFor("windows"))).toBe("/settings/notifications");
        expect(settingPath("overlay-position", itemsFor("windows"))).toBe("/settings/overlay");
    });

    it("has no path for an unknown row", () => {
        expect(settingPath("nope", itemsFor("windows"))).toBeNull();
    });

    it("has no path for a row this platform leaves out", () => {
        expect(settingPath("match-found", itemsFor("linux"))).toBeNull();
    });
});

describe("jumpToSetting", () => {
    beforeEach(() => {
        settingsUi.query = "";
        settingsUi.highlightId = null;
    });

    it("navigates and marks the row for highlight", () => {
        const go = vi.fn();
        jumpToSetting("match-found", go, itemsFor("windows"));
        expect(go).toHaveBeenCalledWith("/settings/notifications");
        expect(settingsUi.highlightId).toBe("match-found");
    });

    it("clears a search so the target page lists the row", () => {
        settingsUi.query = "overlay";
        jumpToSetting("match-found", vi.fn(), itemsFor("windows"));
        expect(settingsUi.query).toBe("");
    });

    it("does nothing for an unknown row", () => {
        const go = vi.fn();
        jumpToSetting("nope", go, itemsFor("windows"));
        expect(go).not.toHaveBeenCalled();
        expect(settingsUi.highlightId).toBeNull();
    });
});

describe("takeHighlight", () => {
    it("hands the id out once", () => {
        settingsUi.highlightId = "match-found";
        expect(settingsUi.takeHighlight()).toBe("match-found");
        expect(settingsUi.takeHighlight()).toBeNull();
    });
});

describe("highlightStep", () => {
    const items = itemsFor("windows");

    it("waits while the page shown is not the row's category", () => {
        expect(highlightStep("match-found", "overlay", items)).toBe("wait");
    });

    it("consumes once the row's category is shown", () => {
        expect(highlightStep("match-found", "notifications", items)).toBe("consume");
    });

    it("drops an id no row has", () => {
        expect(highlightStep("nope", "overlay", items)).toBe("drop");
    });
});
