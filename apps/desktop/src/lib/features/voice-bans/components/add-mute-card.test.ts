import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import AddMuteCard from "./add-mute-card.svelte";
import type { Profile } from "../profiles";

const lowlight: Profile = { steamid64: "76561198000000001", name: "Lowlight", avatar: null, profileUrl: null };
const nameless: Profile = { steamid64: "76561198000000002", name: "", avatar: null, profileUrl: null };

function html(results: Profile[], mutedSet: Set<string> = new Set()): string {
    return render(AddMuteCard, {
        props: {
            value: "",
            results,
            mutedSet,
            busy: false,
            locked: false,
            searching: false,
            onsubmit: () => {},
            onmute: () => {},
            onopen: () => {},
        },
    }).body;
}

describe("AddMuteCard search results", () => {
    it("names the player on the open-profile button", () => {
        expect(html([lowlight])).toContain('aria-label="Open Statlocker profile of Lowlight"');
    });

    it("names the player on the mute button", () => {
        expect(html([lowlight])).toContain('aria-label="Mute Lowlight"');
    });

    it("falls back to the Steam ID when a result has no name", () => {
        const body = html([nameless]);

        expect(body).toContain(`aria-label="Open Statlocker profile of ${nameless.steamid64}"`);
        expect(body).toContain(`aria-label="Mute ${nameless.steamid64}"`);
    });
});
