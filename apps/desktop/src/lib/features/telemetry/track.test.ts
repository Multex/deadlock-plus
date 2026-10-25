import { describe, expect, it } from "vitest";
import { featureForPath } from "./track";

describe("featureForPath", () => {
    it("names the home page", () => {
        expect(featureForPath("/")).toBe("home");
    });

    it("uses the first path segment of a feature route", () => {
        expect(featureForPath("/server-picker")).toBe("server-picker");
        expect(featureForPath("/stats/anything/deeper")).toBe("stats");
        expect(featureForPath("/voice-bans/")).toBe("voice-bans");
    });

    it("names the live page", () => {
        expect(featureForPath("/live")).toBe("live");
    });

    it("names the Dispatch page", () => {
        expect(featureForPath("/dispatch")).toBe("dispatch");
    });

    it("names the presence page", () => {
        expect(featureForPath("/presence")).toBe("presence");
    });

    it("names the match history and what's new pages", () => {
        expect(featureForPath("/match-history")).toBe("match-history");
        expect(featureForPath("/match-history/123")).toBe("match-history");
        expect(featureForPath("/whats-new")).toBe("whats-new");
    });

    it("groups every settings page under one name", () => {
        expect(featureForPath("/settings/privacy")).toBe("settings");
    });

    it("keeps counting the storage settings page as storage", () => {
        expect(featureForPath("/settings/storage")).toBe("storage");
        expect(featureForPath("/settings/storage/")).toBe("storage");
        expect(featureForPath("/settings")).toBe("settings");
    });

    it("ignores routes that are not features, so nothing free-form leaves the page", () => {
        expect(featureForPath("/onboarding")).toBeNull();
        expect(featureForPath("/users/someone")).toBeNull();
    });
});
