import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import SlotFields from "./slot-fields.svelte";
import type { Scope } from "$lib/features/presence/config";

const EMPTY: PresenceConfig = { states: {}, variants: {}, heroes: {} };
const ART = { heroPortrait: null, heroIcon: null, rankBadge: null };

function html(scope: Scope): string {
    return render(SlotFields, {
        props: { scope, config: EMPTY, defaults: EMPTY, placeholders: [], art: ART, edit: () => {} },
    }).body;
}

/** Every opening tag in the markup that carries the given attribute text. */
function tagsWith(body: string, attr: string): string[] {
    return [...body.matchAll(/<[a-z][^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes(attr));
}

describe("SlotFields accessible names", () => {
    it("names the party size switch by what it does on Discord", () => {
        const tags = tagsWith(html({ state: "inMatch" }), 'aria-label="Show party size"');

        expect(tags).toHaveLength(1);
        expect(tags[0]).toContain('role="switch"');
    });

    it("names the timer menu by what it does on Discord", () => {
        const tags = tagsWith(html({ state: "inMatch" }), 'aria-label="Timer on Discord"');

        expect(tags).toHaveLength(1);
        expect(tags[0]).toContain("aria-expanded");
    });

    it("keeps the visible Party size and Timer labels", () => {
        const body = html({ state: "inMatch" });

        expect(body).toMatch(/<label[^>]*>Party size<\/label>/);
        expect(body).toMatch(/<label[^>]*>Timer<\/label>/);
    });
});
