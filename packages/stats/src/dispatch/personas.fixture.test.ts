import { describe, expect, it } from "vitest";
import { PERSONAS, personaEdition } from "./personas.fixture";
import type { EditionKind } from "./types";

const KINDS: readonly EditionKind[] = ["weekly", "monthly", "collectors", "year_end"];

describe("persona fixture", () => {
    // `editionStats` and `editionCalendar` count the same rows, so a real edition can never hold a month
    // busier than its whole window.
    it("keeps every persona's calendar inside its own totals", () => {
        for (const p of PERSONAS) {
            for (const kind of KINDS) {
                const e = personaEdition(p, kind);
                const where = `${p} ${kind}`;
                expect(e.stats.busiestMonth!.matches, where).toBeLessThanOrEqual(e.stats.matches);
                if (!e.months) continue;
                expect(
                    e.months.reduce((n, m) => n + m.matches, 0),
                    where,
                ).toBe(e.stats.matches);
                expect(
                    e.months.reduce((n, m) => n + m.wins, 0),
                    where,
                ).toBe(e.stats.wins);
            }
        }
    });
});
