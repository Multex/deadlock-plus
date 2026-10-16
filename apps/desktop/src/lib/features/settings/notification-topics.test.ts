import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATIONS, DELIVERIES, resolveNotifications } from "./notification-topics";

describe("notification settings", () => {
    it("matches the backend defaults", () => {
        expect(DEFAULT_NOTIFICATIONS).toEqual({
            deliveries: {
                updates: "both",
                maintenance: "both",
                serverBlocksUpdated: "quiet",
                serverBlocksStale: "both",
                breakReminder: "both",
                matchFound: "overlay",
            },
            serverBlocksUpdated: true,
            serverBlocksStale: true,
        });
    });

    it("lists the deliveries in menu order", () => {
        expect(DELIVERIES).toEqual(["both", "overlay", "os", "quiet", "center"]);
    });

    it("uses the defaults when nothing usable is stored", () => {
        for (const stored of [undefined, null, "on", [true], 3]) {
            expect(resolveNotifications(stored)).toEqual(DEFAULT_NOTIFICATIONS);
        }
    });

    it("keeps every stored value that is valid", () => {
        const stored = {
            deliveries: {
                updates: "os",
                maintenance: "center",
                serverBlocksUpdated: "overlay",
                serverBlocksStale: "quiet",
                breakReminder: "overlay",
                matchFound: "both",
            },
            serverBlocksUpdated: false,
            serverBlocksStale: false,
        };
        expect(resolveNotifications(stored)).toEqual(stored);
    });

    it("falls back per field for missing or invalid values", () => {
        const resolved = resolveNotifications({
            deliveries: { updates: "os", maintenance: "loud", matchFound: 4, unknownTopic: "os" },
            serverBlocksUpdated: "no",
            serverBlocksStale: false,
        });
        expect(resolved).toEqual({
            ...DEFAULT_NOTIFICATIONS,
            deliveries: { ...DEFAULT_NOTIFICATIONS.deliveries, updates: "os" },
            serverBlocksStale: false,
        });
    });

    it("fills every delivery when the stored deliveries are not an object", () => {
        expect(resolveNotifications({ deliveries: ["os"], serverBlocksUpdated: false })).toEqual({
            ...DEFAULT_NOTIFICATIONS,
            serverBlocksUpdated: false,
        });
    });

    it("returns a copy the caller can change without touching the defaults", () => {
        const resolved = resolveNotifications(undefined);
        resolved.deliveries.updates = "center";
        expect(DEFAULT_NOTIFICATIONS.deliveries.updates).toBe("both");
    });
});
