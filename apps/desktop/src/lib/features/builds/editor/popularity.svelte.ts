import { deadlockApi } from "$lib/core/deadlock-api";
import { t } from "$lib/core/i18n.svelte";
import { loadPopularItems } from "$lib/features/gamedata/vdata";
import { loadHeroes } from "$lib/features/heroes/heroes";
import type { AnalyticsFilter, HeroStatsRow, ItemStats, ItemStatsFilter } from "@deadlock-plus/deadlock-api";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";
import {
    cardLines,
    gamePopular,
    HERO_MATCHES_FILTER,
    heroMatches,
    PHASES,
    phaseFilter,
    phaseStats,
    pickScore,
    type GamePopular,
    type Phase,
    type PhaseStats,
} from "./popularity";

export interface PopularityDeps {
    loadGame(heroId: number): Promise<PopularItems | null>;
    itemStats(filter: ItemStatsFilter): Promise<ItemStats[]>;
    heroStats(filter: AnalyticsFilter): Promise<HeroStatsRow[]>;
    loadIcon(heroId: number): Promise<string | null>;
}

const defaultDeps: PopularityDeps = {
    loadGame: loadPopularItems,
    itemStats: (filter) => deadlockApi.itemStats(filter),
    heroStats: (filter) => deadlockApi.heroStats(filter),
    loadIcon: async (heroId) => (await loadHeroes([heroId]))[heroId]?.icon ?? null,
};

export interface PopularityText {
    popular: string[];
    stats: { label: string; value: string }[];
}

/** One hero's item popularity: the game's Popular set and, when deadlock-api answers, every item's stats. */
export class HeroPopularity {
    game = $state.raw<ReadonlyMap<number, readonly GamePopular[]>>(new Map());
    /** Null while loading or when the API is unreachable. */
    api = $state.raw<PhaseStats | null>(null);
    /** The hero's icon for the game's popular marker. */
    icon = $state.raw<string | null>(null);
    #deps: PopularityDeps;
    #token = 0;

    constructor(deps: PopularityDeps = defaultDeps) {
        this.#deps = deps;
    }

    async load(heroId: number): Promise<void> {
        const token = ++this.#token;
        const current = () => token === this.#token;
        this.game = new Map();
        this.api = null;
        this.icon = null;
        const d = this.#deps;
        await Promise.all([
            d
                .loadGame(heroId)
                .catch(() => null)
                .then((p) => current() && (this.game = gamePopular(p))),
            d
                .loadIcon(heroId)
                .catch(() => null)
                .then((icon) => current() && (this.icon = icon)),
            this.#loadApi(heroId)
                .catch(() => null)
                .then((api) => current() && (this.api = api)),
        ]);
    }

    async #loadApi(heroId: number): Promise<PhaseStats> {
        const [heroes, ...rows] = await Promise.all([
            this.#deps.heroStats(HERO_MATCHES_FILTER),
            ...PHASES.map((phase) => this.#deps.itemStats(phaseFilter(heroId, phase))),
        ]);
        const total = heroMatches(heroes, heroId);
        const [early, mid, late] = rows.map((r) => phaseStats(r, total)) as [
            PhaseStats["early"],
            PhaseStats["mid"],
            PhaseStats["late"],
        ];
        return { early, mid, late };
    }

    /** True for items on the hero's Popular page in the game: they get the hero icon + green arrow marker. */
    isPopular(itemId: number): boolean {
        return this.game.has(itemId);
    }

    /** True when there is anything to sort by. */
    get available(): boolean {
        return this.api !== null || this.game.size > 0;
    }

    score(phase: Phase): (itemId: number) => number | undefined {
        return pickScore(phase, this.api, this.game);
    }

    /** The item card's popularity lines, translated. `stats` is empty when the API is unreachable. */
    lines(itemId: number): PopularityText {
        const lines = cardLines(itemId, this.game, this.api);
        return {
            popular: lines.popular.map((l) => t(`builds.editor.picker.popular_${l.phase}`, { pct: l.pct })),
            stats: lines.stats.map((l) => ({
                label: t(`builds.editor.picker.phase_${l.phase}`),
                value: t("builds.editor.picker.pick_win", { pick: l.pickPct, win: l.winPct }),
            })),
        };
    }
}
