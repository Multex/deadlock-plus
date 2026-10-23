import { untrack } from "svelte";
import { failureText } from "$lib/core/errors";
import { i18n, t } from "$lib/core/i18n.svelte";
import { parseSteamId, steam64ToSteam32 } from "$lib/core/player-links";
import { onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import { live } from "$lib/features/live/live.svelte";
import { playerNames } from "$lib/features/match-history/names";
import { stats } from "$lib/features/stats/stats.svelte";
import { searchPlayers, type Profile } from "$lib/features/voice-bans/profiles";
import { buildsLocal } from "./api";
import { BuildDetail } from "./build-detail.svelte";
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
    winRates = $state.raw<ReadonlyMap<number, WinRate>>(new Map());
    /** Builds the file holds in `Favorites`; an unreadable file shows none as favourites. */
    favouriteIds = $state.raw<ReadonlySet<number>>(new Set());

    private details = new Map<number, BuildDetail>();

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
        void buildsLocal().then(
            (local) => {
                const ids = new Set(
                    local.builds.filter((b) => b.section === "Favorites").map((b) => b.build.heroBuildId),
                );
                this.favouriteIds = ids;
                // A pane opened before the file answered starts as not a favourite.
                for (const [id, detail] of this.details) {
                    if (detail.favourite.kind === "idle") detail.favourited = ids.has(id);
                }
            },
            () => {},
        );
        return onHeroesRefreshed((h) => void loadHeroFlags().then((flags) => (this.heroes = playableHeroes(h, flags))));
    }

    /** Takes the filters the URL carries; the name field follows unless it already says the same. */
    readFilters(filters: BrowserFilters): void {
        // Selecting a build also rewrites the URL; equal filters must not reload the list under the selection.
        const same = JSON.stringify(filters) === JSON.stringify(untrack(() => this.filters));
        if (!same) this.filters = filters;
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

    /**
     * The detail pane's copy and favourite actions, kept per build for the page's life so a result stays
     * with its build. Filled from the list: the pane needs no request of its own.
     */
    detailFor(entry: PublicBuild): BuildDetail {
        const id = entry.build.heroBuildId;
        let detail = this.details.get(id);
        if (!detail) {
            detail = new BuildDetail({ source: "public", id });
            detail.build = entry.build;
            detail.favourites = entry.favorites;
            detail.favourited = this.favouriteIds.has(id);
            detail.status = "ready";
            this.details.set(id, detail);
        }
        return detail;
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
        // `readFilters` runs this inside the page's URL effect, which must not rerun when names arrive.
        const ids = untrack(() => [...new Set(accountIds)].filter((id) => !this.authors.has(id)));
        if (ids.length === 0) return;
        try {
            const names = await playerNames.resolve(ids);
            // A private profile resolves to no name; reassigning anyway would rerun every effect that reads `authors`.
            if (names.size === 0) return;
            this.authors = new Map([...this.authors, ...names]);
        } catch {
            // Cards show no author until a later load resolves the names.
        }
    }
}

function toMatch(p: Profile): AuthorMatch {
    return { accountId: Number(steam64ToSteam32(p.steamid64)), name: p.name, avatar: p.avatar };
}
