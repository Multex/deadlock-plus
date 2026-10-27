import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import TeamTable from "./team-table.svelte";

describe("team table", () => {
    it("gives every labelled header icon a role that allows a label", () => {
        const { body } = render(TeamTable, {
            props: {
                team: { side: "amber", souls: 0, players: [] },
                totalSouls: 0,
                clockSecs: null,
                pregame: true,
                heroes: {},
                tiers: [],
                swapped: new Map(),
            },
        });
        const labelled = [...body.matchAll(/<(span|div)\b([^>]*\baria-label=[^>]*)>/g)];
        expect(labelled.length).toBeGreaterThan(0);
        for (const [tag, , attrs] of labelled) expect(attrs, tag).toMatch(/\brole="/);
    });
});
