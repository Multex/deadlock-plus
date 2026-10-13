import { describe, expect, it } from "vitest";
import { laneForObjectiveSlot, laneForPlayerLane, objectiveLaneSlot } from "./lanes";

describe("lane identity", () => {
    it("maps the lane a player was assigned to its colour", () => {
        expect(laneForPlayerLane(1)).toMatchObject({ color: "yellow", hex: "#F1CC30" });
        expect(laneForPlayerLane(4)).toMatchObject({ color: "blue", hex: "#29B1CC" });
        expect(laneForPlayerLane(6)).toMatchObject({ color: "green", hex: "#59B247" });
    });

    it("has no lane for ids the game marks unused", () => {
        expect(laneForPlayerLane(0)).toBeUndefined();
        expect(laneForPlayerLane(2)).toBeUndefined();
        expect(laneForPlayerLane(undefined)).toBeUndefined();
    });

    it("maps an objective's lane slot to the same lane the players use", () => {
        expect(laneForObjectiveSlot(1)?.color).toBe("yellow");
        expect(laneForObjectiveSlot(3)?.color).toBe("blue");
        expect(laneForObjectiveSlot(4)?.color).toBe("green");
        expect(laneForObjectiveSlot(2)).toBeUndefined();
    });
});

describe("objectiveLaneSlot", () => {
    it("reads the lane slot of guardians, walkers and base guardians", () => {
        expect(objectiveLaneSlot(1)).toBe(1);
        expect(objectiveLaneSlot(4)).toBe(4);
        expect(objectiveLaneSlot(5)).toBe(1);
        expect(objectiveLaneSlot(8)).toBe(4);
        expect(objectiveLaneSlot(12)).toBe(1);
        expect(objectiveLaneSlot(15)).toBe(4);
    });

    it("is undefined for objectives that belong to no lane", () => {
        for (const id of [0, 9, 10, 11, 99]) expect(objectiveLaneSlot(id)).toBeUndefined();
    });
});
