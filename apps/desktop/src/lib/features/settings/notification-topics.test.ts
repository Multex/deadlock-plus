import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATIONS, DELIVERIES, deliveriesFor, resolveNotifications } from "./notification-topics";

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
                queueStopped: "overlay",
                frontPageWaiting: "overlay",
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
                matchFound: "overlay",
                queueStopped: "overlay",
                frontPageWaiting: "overlay",
            },
            serverBlocksUpdated: false,
            serverBlocksStale: false,
        };
        expect(resolveNotifications(stored)).toEqual(stored);
    });

    it("offers the overlay delivery only where there is an overlay", () => {
        expect(deliveriesFor("windows")).toEqual(["both", "overlay", "os", "quiet", "center"]);
        expect(deliveriesFor("linux")).toEqual(["both", "os", "quiet", "center"]);
        expect(deliveriesFor("macos")).not.toContain("overlay");
    });

    it("reads a stored overlay delivery as os where there is no overlay", () => {
        const stored = { deliveries: { updates: "overlay", breakReminder: "overlay", maintenance: "center" } };
        const linux = resolveNotifications(stored, "linux").deliveries;
        expect([linux.updates, linux.breakReminder, linux.maintenance]).toEqual(["os", "os", "center"]);
        const windows = resolveNotifications(stored, "windows").deliveries;
        expect([windows.updates, windows.breakReminder]).toEqual(["overlay", "overlay"]);
    });

    it("reads every stored match found, queue stopped and front page waiting delivery as overlay", () => {
        for (const stored of ["both", "os", "quiet", "center"]) {
            const { deliveries } = resolveNotifications({
                deliveries: { matchFound: stored, queueStopped: stored, frontPageWaiting: stored },
            });
            expect([deliveries.matchFound, deliveries.queueStopped, deliveries.frontPageWaiting]).toEqual([
                "overlay",
                "overlay",
                "overlay",
            ]);
        }
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
