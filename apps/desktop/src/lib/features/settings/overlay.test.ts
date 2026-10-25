import { describe, expect, it } from "vitest";
import { DEFAULT_OVERLAY, DURATION_RANGE, OVERLAY_POSITIONS, resolveOverlay } from "./overlay";

describe("overlay settings", () => {
    it("defaults to on, top right, six seconds, with match found and queue stopped on", () => {
        expect(DEFAULT_OVERLAY).toEqual({
            enabled: true,
            position: "topRight",
            durationSecs: 6,
            matchFound: true,
            queueStopped: true,
        });
    });

    it("lists the eight positions in reading order", () => {
        expect(OVERLAY_POSITIONS).toEqual([
            "topLeft",
            "topCenter",
            "topRight",
            "left",
            "right",
            "bottomLeft",
            "bottomCenter",
            "bottomRight",
        ]);
    });

    it("lets durations run from 3 to 15 seconds in whole steps", () => {
        expect(DURATION_RANGE).toEqual({ min: 3, max: 15, step: 1 });
    });

    it("uses the defaults when nothing is stored", () => {
        expect(resolveOverlay(undefined)).toEqual(DEFAULT_OVERLAY);
        expect(resolveOverlay(null)).toEqual(DEFAULT_OVERLAY);
        expect(resolveOverlay("on")).toEqual(DEFAULT_OVERLAY);
        expect(resolveOverlay([true])).toEqual(DEFAULT_OVERLAY);
    });

    it("keeps every stored value that is valid", () => {
        const stored = {
            enabled: false,
            position: "bottomLeft",
            durationSecs: 12,
            matchFound: false,
            queueStopped: false,
        };
        expect(resolveOverlay(stored)).toEqual(stored);
    });

    it("fills a missing field from the defaults", () => {
        expect(resolveOverlay({ position: "left" })).toEqual({ ...DEFAULT_OVERLAY, position: "left" });
    });

    it("turns match found on for a value stored before it existed", () => {
        expect(resolveOverlay({ enabled: false, position: "left", durationSecs: 9 }).matchFound).toBe(true);
    });

    it("turns queue stopped on for a value stored before it existed", () => {
        expect(resolveOverlay({ enabled: false, position: "left", durationSecs: 9, matchFound: false })).toEqual({
            enabled: false,
            position: "left",
            durationSecs: 9,
            matchFound: false,
            queueStopped: true,
        });
    });

    it("drops a field of the wrong kind back to its default", () => {
        expect(
            resolveOverlay({
                enabled: "no",
                position: "center",
                durationSecs: "9",
                matchFound: "off",
                queueStopped: 1,
            }),
        ).toEqual(DEFAULT_OVERLAY);
    });

    it("pulls a duration into range and onto a whole second", () => {
        expect(resolveOverlay({ durationSecs: 1 }).durationSecs).toBe(3);
        expect(resolveOverlay({ durationSecs: 60 }).durationSecs).toBe(15);
        expect(resolveOverlay({ durationSecs: 7.4 }).durationSecs).toBe(7);
        expect(resolveOverlay({ durationSecs: Number.NaN }).durationSecs).toBe(6);
    });
});
