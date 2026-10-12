import { describe, expect, it } from "vitest";
import { leadItems, weekdayItems } from "./select-items";

describe("weekdayItems", () => {
    it("uses the day's index as the value", () => {
        expect(weekdayItems(["Monday", "Tuesday", "Wednesday"])).toEqual([
            { value: "0", label: "Monday" },
            { value: "1", label: "Tuesday" },
            { value: "2", label: "Wednesday" },
        ]);
    });
});

describe("leadItems", () => {
    const labels = {
        minutes: (minutes: number) => `${minutes} min before`,
        hours: (hours: number) => `${hours} h before`,
    };

    it("labels leads under an hour in minutes and the rest in hours", () => {
        expect(leadItems([15, 30, 60, 120], labels)).toEqual([
            { value: "15", label: "15 min before" },
            { value: "30", label: "30 min before" },
            { value: "60", label: "1 h before" },
            { value: "120", label: "2 h before" },
        ]);
    });
});
