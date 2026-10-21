import { untrack } from "svelte";
import { failureText } from "$lib/core/errors";
import { i18n, t } from "$lib/core/i18n.svelte";
import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import { playerNames } from "$lib/features/match-history/names";
import { stats } from "$lib/features/stats/stats.svelte";
import { loadShopCatalog } from "./catalog";
import {
    browserLanguages,
    publicBuilds,
    type PublicBuild,
    type PublicBuildsRequest,
    type PublicSort,
} from "./public-builds";
import type { ChipItem } from "./shop-view";

export type BrowserStatus = "loading" | "ready" | "error";

const SEARCH_DELAY_MS = 300;

function pickable(heroes: Record<number, Hero>): Hero[] {
    return Object.values(heroes)
        .filter((h) => h.selectable !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export class BuildBrowser {
    heroes = $state.raw<Hero[]>([]);
    /** Null until the player picks a hero: the browser then follows the last played one. */
    picked = $state<number | null>(null);
    sort = $state<PublicSort>("weekly");
    search = $state("");
    status = $state<BrowserStatus>("loading");
    builds = $state.raw<PublicBuild[]>([]);
    error = $state<string | null>(null);
    authors = $state.raw<ReadonlyMap<number, string>>(new Map());
    resolve = $state.raw<((abilityId: number) => ChipItem | undefined) | null>(null);

    private query = $state("");
    private token = 0;

    readonly heroId = $derived.by(() => {
        if (this.picked !== null) return this.picked;
        const last = stats.matches.at(-1)?.heroId;
        if (last !== undefined && this.heroes.some((h) => h.id === last)) return last;
        return this.heroes[0]?.id ?? null;
    });

    readonly request = $derived<PublicBuildsRequest | null>(
        this.heroId === null
            ? null
            : {
                  heroId: this.heroId,
                  sort: this.sort,
                  search: this.query,
                  languages: browserLanguages(i18n.locale),
              },
    );

    /** Call from `onMount`; returns the cleanup. */
    start(): () => void {
        void loadHeroes().then((h) => (this.heroes = pickable(h)));
        void loadShopCatalog(i18n.locale)
            .then((catalog) => {
                this.resolve = (abilityId) => {
                    const item = catalog.byId.get(abilityId);
                    return (
                        item && {
                            name: item.name,
                            art: item.art,
                            slot: item.slot,
                            tier: item.tier,
                            active: item.active,
                        }
                    );
                };
            })
            .catch(() => {});
        return onHeroesRefreshed((h) => (this.heroes = pickable(h)));
    }

    /** Call from an effect that reads `search`; returns the cleanup. */
    debounceSearch(): () => void {
        const text = this.search;
        const timer = setTimeout(() => (this.query = text), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }

    load(request: PublicBuildsRequest): Promise<void> {
        return untrack(() => this.fetch(request));
    }

    retry(): void {
        if (this.request) void this.load(this.request);
    }

    private async fetch(request: PublicBuildsRequest) {
        const token = ++this.token;
        this.status = "loading";
        this.error = null;
        try {
            const builds = await publicBuilds.load(request);
            if (token !== this.token) return;
            this.builds = builds;
            this.status = "ready";
            void this.loadAuthors(builds);
        } catch (e) {
            if (token !== this.token) return;
            this.builds = [];
            this.error = failureText(e, t("builds.browser.error"));
            this.status = "error";
        }
    }

    private async loadAuthors(builds: readonly PublicBuild[]) {
        const ids = [...new Set(builds.map((b) => b.build.authorAccountId))].filter((id) => !this.authors.has(id));
        if (ids.length === 0) return;
        try {
            const names = await playerNames.resolve(ids);
            this.authors = new Map([...this.authors, ...names]);
        } catch {
            // Cards show no author until a later load resolves the names.
        }
    }
}
