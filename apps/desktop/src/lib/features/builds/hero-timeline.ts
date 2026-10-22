import type { HeroStats } from "@deadlock-plus/game-ui/hero";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { OrderStep } from "./editor/ability-order";
import { itemsBoughtBy, levelAt, placeItems, type TimelineEntry } from "./editor/timeline";
import { heroStatsAt, type StatCatalog } from "./hero-stats";
import { netWorthFor, type Level } from "./levels";

/** A build's hero over a match: Quick Buy items bought as souls come in, levels reached by souls earned. */
export interface HeroTimeline {
    hero: HeroStatsData;
    entries: readonly TimelineEntry[];
    levels: readonly Level[];
    catalog: StatCatalog;
}

export function heroTimeline(
    hero: HeroStatsData,
    build: BuildView,
    catalog: StatCatalog,
    levels: readonly Level[],
): HeroTimeline {
    return { hero, entries: placeItems(build, catalog.byId), levels, catalog };
}

/** The hero at `netWorth`: the level it reaches and the items bought by then. */
export function heroStatsAtNetWorth(timeline: HeroTimeline, netWorth: number): HeroStats {
    const level = levelAt(timeline.levels, netWorth) ?? 1;
    return heroStatsAt(timeline.hero, { level, itemIds: itemsBoughtBy(timeline.entries, netWorth) }, timeline.catalog);
}

/**
 * The hero when the build reaches step `index`'s level; with a null index, at the start of the match. Undefined for
 * a step past the level table.
 */
export function heroStatsAtStep(
    timeline: HeroTimeline,
    steps: readonly OrderStep[],
    index: number | null,
): HeroStats | undefined {
    const level = index === null ? timeline.levels[0] : timeline.levels.find((l) => l.level === steps[index]?.level);
    return level ? heroStatsAtNetWorth(timeline, netWorthFor(level.souls)) : undefined;
}
