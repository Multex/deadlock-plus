import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { labelInName } from "$lib/core/label-in-name";
import GradeChipHost from "./grade-chip-host.test.svelte";

const grade: MvpPlayerGrade = {
    accountId: 1,
    playerSlot: 0,
    heroId: 1,
    team: 0,
    s10: 661,
    letter: "B",
    place: 4,
    totalPoints: 0,
    farmBonus: 0,
    stats: [],
};

describe("grade chip", () => {
    it("names the chip with the letter, score and place it shows, in that order", () => {
        const body = render(GradeChipHost, { props: { grade } }).body;
        const button = body.match(/<button[^>]*class="chip[^>]*>([\s\S]*?)<\/button>/)!;
        const name = button[0].match(/aria-label="([^"]*)"/)![1];
        expect(name).toMatch(/^Grade B/);
        expect(labelInName(name, button[1])).toBe(true);
    });
});
