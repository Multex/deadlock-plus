import { describe, expect, it, vi } from "vitest";
import { notificationTarget, notificationText, openNotificationFromEvent, type AppNotification } from "./notifications";

const base: AppNotification = {
    id: "a",
    kind: "maintenance",
    key: null,
    params: {},
    title: null,
    body: null,
    timestamp: 0,
    read: false,
    link: null,
};

describe("notificationText", () => {
    it("renders a keyed item from the catalog", () => {
        const text = notificationText({ ...base, key: "notifications.maintenance_soon", params: { minutes: "30" } });
        expect(text.title).toBe("Steam maintenance soon");
        expect(text.body).toContain("in about 30 min");
    });

    it("renders feed text passed as a param", () => {
        const text = notificationText({
            ...base,
            key: "notifications.alert_new_more",
            params: { title: "Patch", count: "2" },
        });
        expect(text.body).toBe("Patch (+2 more)");
    });

    it("falls back to raw text on items stored before keys existed", () => {
        expect(notificationText({ ...base, title: "Old", body: "Old body" })).toEqual({
            title: "Old",
            body: "Old body",
        });
    });

    it("never throws on a missing title or body", () => {
        expect(notificationText(base)).toEqual({ title: "", body: "" });
    });
});

describe("notificationTarget", () => {
    it("prefers the item's link", () => {
        expect(notificationTarget({ ...base, kind: "alert", link: "/alerts" })).toBe("/alerts");
    });

    it("sends maintenance without a link to notification settings", () => {
        expect(notificationTarget(base)).toBe("/settings/notifications");
    });

    it("returns null for an unknown kind without a link", () => {
        expect(notificationTarget({ ...base, kind: "mystery" })).toBeNull();
    });

    it("keeps a link on an unknown kind", () => {
        expect(notificationTarget({ ...base, kind: "mystery", link: "/server-picker" })).toBe("/server-picker");
    });
});

describe("openNotificationFromEvent", () => {
    const deps = () => {
        const goto = vi.fn();
        const markRead = vi.fn();
        return { goto, markRead, items: [{ ...base, id: "x", kind: "alert" as const, link: "/alerts" }] };
    };

    it("marks the item read and navigates to its target", () => {
        const d = deps();
        openNotificationFromEvent({ id: "x", kind: "alert", link: "/alerts" }, d.items, d);
        expect(d.markRead).toHaveBeenCalledWith("x");
        expect(d.goto).toHaveBeenCalledWith("/alerts");
    });

    it("falls back to the payload when the item is not in the list", () => {
        const d = deps();
        openNotificationFromEvent({ id: "gone", kind: "break", link: "/match-history" }, d.items, d);
        expect(d.markRead).toHaveBeenCalledWith("gone");
        expect(d.goto).toHaveBeenCalledWith("/match-history");
    });

    it("does not navigate when there is no target", () => {
        const d = deps();
        openNotificationFromEvent({ id: "gone", kind: "mystery", link: null }, d.items, d);
        expect(d.goto).not.toHaveBeenCalled();
    });

    it("ignores malformed payloads", () => {
        const d = deps();
        openNotificationFromEvent(null, d.items, d);
        openNotificationFromEvent({ kind: "alert" }, d.items, d);
        expect(d.markRead).not.toHaveBeenCalled();
        expect(d.goto).not.toHaveBeenCalled();
    });
});
