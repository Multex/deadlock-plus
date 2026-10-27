import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/i18n.svelte", () => ({
    i18n: { locale: "en", onLocaleChange: () => {} },
    t: (key: string) => key,
    tn: (key: string) => key,
    formatDate: () => "",
    formatNumber: () => "",
}));
const stub = vi.hoisted(() => () => ({ default: () => {} }));
vi.mock("./components/build-detail/ability-order.svelte", stub);
vi.mock("./components/build-detail/shop-panel.svelte", stub);
vi.mock("./components/build-detail/detail-actions.svelte", stub);
vi.mock("./components/my-builds/status-badge.svelte", stub);
vi.mock("$lib/components/player-links/player-name-menu.svelte", stub);
vi.mock("$app/navigation", () => ({ goto: () => {} }));

import AbilityArt from "./components/editor/ability-bar/ability-art.svelte";
import BuildOverview from "./components/browser/build-overview.svelte";
import DetailHeader from "./components/build-detail/detail-header.svelte";

const hero = { id: 1, name: "Haze", icon: null, portrait: null } as never;
const build = {
    heroBuildId: 1,
    name: "B",
    description: "",
    lastUpdatedTimestamp: 0,
    authorAccountId: 1,
    heroId: 1,
} as never;
const slot = createRawSnippet(() => ({ render: () => "<i></i>" }));

const fallbackCount = (html: string) => (html.match(/data-art-state="fallback"/g) ?? []).length;

describe("missing art", () => {
    it("ability art with no src shows initials in place of an img", () => {
        const { body } = render(AbilityArt, { props: { ability: { id: 1, name: "Heroic Aura" }, class: "size-8" } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toContain("HA");
    });

    it("build overview with no hero art keeps the tile and shows a placeholder", () => {
        const { body } = render(BuildOverview, {
            props: {
                build,
                hero,
                author: null,
                version: null,
                tags: [],
                catalog: null,
                catalogFailed: false,
                kit: null,
                actions: slot,
            },
        });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toContain("h-[88px] w-[72px]");
    });

    it("build detail header with no hero art keeps the tile and shows a placeholder", () => {
        const detail = { build, hero, author: null, badge: null, favourites: null } as never;
        const { body } = render(DetailHeader, { props: { detail, ownAccountId: 2 } });
        expect(body).not.toContain("<img");
        expect(fallbackCount(body)).toBe(1);
        expect(body).toContain("h-28 w-24");
    });
});
