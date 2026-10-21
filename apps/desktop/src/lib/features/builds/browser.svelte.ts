import { untrack } from "svelte";
import { failureText } from "$lib/core/errors";
import { i18n, t } from "$lib/core/i18n.svelte";
import { loadBuildTags } from "$lib/features/gamedata/vdata";
import { onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import { live } from "$lib/features/live/live.svelte";
import { playerNames } from "$lib/features/match-history/names";
import { stats } from "$lib/features/stats/stats.svelte";
import { searchPlayers, type Profile } from "$lib/features/voice-bans/profiles";
import { parseSteamId, steam64ToSteam32 } from "$lib/features/voice-bans/voice-ban";
import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import { loadShopCatalog } from "./catalog";
import { loadHeroFlags, loadPlayableHeroes, playableHeroes } from "./heroes";
import {
    buildWinRates,
    DEFAULT_FILTERS,
    liveHeroId,
    publicBuilds,
    requestLanguages,
    startingHero,
    windowStart,
    type BrowserFilters,
    type PublicBuild,
    type PublicBuildsRequest,
    type WinRate,
} from "./public-builds";
import type { ChipItem } from "./shop-view";

export type BrowserStatus = "loading" | "ready" | "error";

export interface AuthorMatch {
    accountId: number;
    name: string;
    avatar: string | null;
}

const SEARCH_DELAY_MS = 300;
const AUTHOR_RESULTS = 6;

export class BuildBrowser {
    heroes = $state.raw<Hero[]>([]);
    /** Null until the player picks a hero: the browser then follows `requested`, then the current or last played one. */
    picked = $state<number | null>(null);
    /** A hero page's `?hero=` link. */
    requested = $state<number | null>(null);
    /** Mirrors the URL; change it through the page's navigation so the URL stays the source. */
    filters = $state.raw<BrowserFilters>(DEFAULT_FILTERS);
    /** The name field as typed; it reaches `filters.name` after a pause. */
    search = $state("");
    authorQuery = $state("");
    authorMatches = $state.raw<AuthorMatch[] | null>(null);
    status = $state<BrowserStatus>("loading");
    builds = $state.raw<PublicBuild[]>([]);
    error = $state<string | null>(null);
    authors = $state.raw<ReadonlyMap<number, string>>(new Map());
    tags = $state.raw<(BuildTag & { icon?: string | null })[]>([]);
    winRates = $state.raw<ReadonlyMap<number, WinRate>>(new Map());
    resolve = $state.raw<((abilityId: number) => ChipItem | undefined) | null>(null);

    private token = 0;
    private authorToken = 0;

    readonly heroId = $derived(
        startingHero(this.heroes, [this.picked, this.requested, liveHeroId(live.match), stats.matches.at(-1)?.heroId]),
    );

    readonly request = $derived<PublicBuildsRequest | null>(
        this.heroId === null
            ? null
            : {
                  heroId: this.heroId,
                  sort: this.filters.sort,
                  since: windowStart(this.filters.within, Math.floor(Date.now() / 1000)),
                  tag: this.filters.tag,
                  languages: requestLanguages(this.filters.language, i18n.locale),
                  author: this.filters.author,
                  name: this.filters.name,
                  minFavorites: this.filters.minFavorites,
              },
    );

    readonly filtered = $derived(
        this.filters.tag !== null ||
            this.filters.language !== DEFAULT_FILTERS.language ||
            this.filters.minFavorites > 0 ||
            this.filters.author !== null ||
            this.filters.name.trim() !== "" ||
            this.filters.within !== DEFAULT_FILTERS.within,
    );

    /** Call from `onMount`; returns the cleanup. */
    start(): () => void {
        void loadPlayableHeroes().then((h) => (this.heroes = h));
        void loadBuildTags(i18n.locale).then((tags) => (this.tags = tags));
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
        return onHeroesRefreshed((h) => void loadHeroFlags().then((flags) => (this.heroes = playableHeroes(h, flags))));
    }

    /** Takes the filters the URL carries; the name field follows unless it already says the same. */
    readFilters(filters: BrowserFilters): void {
        this.filters = filters;
        untrack(() => {
            if (this.search.trim() !== filters.name) this.search = filters.name;
        });
        if (filters.author !== null) void this.loadAuthors([filters.author]);
    }

    /** Call from an effect that reads `search`; `apply` receives the filters to write once typing pauses. */
    debounceSearch(apply: (filters: BrowserFilters) => void): () => void {
        const name = this.search.trim();
        if (name === untrack(() => this.filters.name)) return () => {};
        const timer = setTimeout(() => apply({ ...untrack(() => this.filters), name }), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }

    /** Call from an effect that reads `authorQuery`; a Steam id or profile link needs no search. */
    debounceAuthor(apply: (filters: BrowserFilters) => void): () => void {
        const query = this.authorQuery.trim();
        const token = ++this.authorToken;
        if (query === "") {
            this.authorMatches = null;
            return () => {};
        }
        const steamId = parseSteamId(query);
        const timer = setTimeout(async () => {
            if (steamId) {
                this.pickAuthor(Number(steam64ToSteam32(steamId)), apply);
                return;
            }
            try {
                const found = await searchPlayers(query, AUTHOR_RESULTS);
                if (token === this.authorToken) this.authorMatches = found.map(toMatch);
            } catch {
                if (token === this.authorToken) this.authorMatches = [];
            }
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }

    pickAuthor(accountId: number, apply: (filters: BrowserFilters) => void, name?: string): void {
        if (name) this.authors = new Map([...this.authors, [accountId, name]]);
        this.authorQuery = "";
        this.authorMatches = null;
        apply({ ...this.filters, author: accountId });
    }

    load(request: PublicBuildsRequest): Promise<void> {
        return untrack(() => this.fetch(request));
    }

    loadWinRates(heroId: number): Promise<void> {
        return untrack(async () => {
            const rates = await buildWinRates.load(heroId);
            if (this.heroId === heroId) this.winRates = rates;
        });
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
            void this.loadAuthors(builds.map((b) => b.build.authorAccountId));
        } catch (e) {
            if (token !== this.token) return;
            this.builds = [];
            this.error = failureText(e, t("builds.browser.error"));
            this.status = "error";
        }
    }

    private async loadAuthors(accountIds: readonly number[]) {
        const ids = [...new Set(accountIds)].filter((id) => !this.authors.has(id));
        if (ids.length === 0) return;
        try {
            const names = await playerNames.resolve(ids);
            this.authors = new Map([...this.authors, ...names]);
        } catch {
            // Cards show no author until a later load resolves the names.
        }
    }
}

function toMatch(p: Profile): AuthorMatch {
    return { accountId: Number(steam64ToSteam32(p.steamid64)), name: p.name, avatar: p.avatar };
}
