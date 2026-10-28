import { describe, expect, it } from "vitest";
import type { Beat } from "../../beats";
import { beatAt } from "../collectors";
import type { CollectorsBeatId } from "./plan";

const BAR = 1.5;
const plan: Beat<CollectorsBeatId>[] = [
    { id: "c_pack", kind: "collectors", bar: 0, bars: 2, presents: [] },
    { id: "c_tear", kind: "collectors", bar: 2, bars: 1, presents: [] },
    { id: "c_fan", kind: "collectors", bar: 3, bars: 3, presents: [] },
];

describe("beatAt", () => {
    it("cuts on the bar lines, each beat starting at local 0", () => {
        expect(beatAt(plan, 0, BAR)).toMatchObject({ id: "c_pack", local: 0, span: 3 });
        expect(beatAt(plan, 2.99, BAR).id).toBe("c_pack");
        expect(beatAt(plan, 3, BAR)).toMatchObject({ id: "c_tear", local: 0, span: 1.5 });
        expect(beatAt(plan, 5, BAR)).toMatchObject({ id: "c_fan", span: 4.5 });
        expect(beatAt(plan, 5, BAR).local).toBeCloseTo(0.5, 9);
    });
    it("holds the last beat's final frame past the end", () => {
        const end = beatAt(plan, 99, BAR);
        expect(end.id).toBe("c_fan");
        expect(end.local).toBeLessThan(end.span);
        expect(end.local).toBeGreaterThan(end.span - 0.05);
    });
});
