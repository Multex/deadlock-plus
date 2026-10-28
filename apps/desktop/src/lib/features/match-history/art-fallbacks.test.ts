import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/i18n.svelte", () => ({
    i18n: { locale: "en", onLocaleChange: () => {} },
    t: (key: string) => key,
    tn: (key: string) => key,
    formatDate: () => "",
    formatNumber: () => "",
}));

import HeroIcon from "$lib/features/live/components/hero-icon.svelte";
import RankBadge from "$lib/features/live/components/rank-badge.svelte";
import IdTile from "./components/detail/deep-dive/id-tile.svelte";
import ItemTile from "./components/detail/item-tile.svelte";

const fallbackCount = (html: string) => (html.match(/data-art-state="fallback"/g) ?? []).length;

describe("missing match art", () => {
    it("hero icon with no art shows initials in place of an img", () => {
        const heroes = { 7: { id: 7, name: "Lady Geist", icon: "" } } as never;
        const { body } = render(HeroIcon, { props: { heroId: 7, heroes, size: 24 } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body, body).toMatch(/width:\s*24px/);
        expect(body).toContain("LG");
    });

    it("hero icon with art keeps its img", () => {
        const heroes = { 7: { id: 7, name: "Lady Geist", icon: "asset://geist.png" } } as never;
        const { body } = render(HeroIcon, { props: { heroId: 7, heroes, size: 24 } });
        expect(body).toMatch(/<img[^>]*src="asset:\/\/geist.png"/);
        expect(fallbackCount(body)).toBe(0);
    });

    it("rank badge with no art shows the tier numeral in place of an img", () => {
        const tiers = [{ tier: 5, name: "Ritualist", image: "", color: "red" }] as never;
        const { body } = render(RankBadge, { props: { rank: 53, tiers } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toMatch(/>5</);
    });

    it("item and ability tile with no art keeps its box without an img", () => {
        const { body } = render(IdTile, { props: { src: "", label: "Rat Swarm", size: 28 } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toMatch(/width:\s*28px/);
    });

    it("scoreboard item with no art shows initials without an img", () => {
        const slot = { itemId: 1, name: "Basic Magazine", src: "" } as never;
        const { body } = render(ItemTile, { props: { slot } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toContain("BM");
    });
});
