<script lang="ts">
    import { onMount } from "svelte";

    import { i18n } from "$lib/core/i18n.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadRankTiers } from "$lib/features/ranks/ranks";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import type { IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
    import { resolveItemListVisuals } from "../../deep-dive/catalog";
    import { allPlayers, type MatchDetail } from "@deadlock-plus/match/detail";
    import { boardTeams, headerSummary } from "@deadlock-plus/match/scoreboard";
    import type { Versus } from "@deadlock-plus/match/versus";
    import TeamBoard from "./team-board.svelte";

    let {
        detail,
        ownAccountId,
        versus = null,
    }: { detail: MatchDetail; ownAccountId: number | null; versus?: Versus | null } = $props();

    let heroes = $state<Record<number, Hero>>({});
    let tiers = $state.raw<RankTier[]>([]);
    let visuals = $state.raw<ReadonlyMap<number, IdVisual>>(new Map());

    const boards = $derived(boardTeams(detail, ownAccountId));
    const summary = $derived(headerSummary(detail, ownAccountId));
    const heroIds = $derived([...new Set(allPlayers(detail).map((p) => p.heroId))]);
    const itemIds = $derived([...new Set(allPlayers(detail).flatMap((p) => p.items.map((i) => i.itemId)))]);

    $effect(() => {
        const ids = heroIds;
        let live = true;
        void loadHeroes(ids).then((h) => {
            if (live) heroes = h;
        });
        return () => (live = false);
    });

    $effect(() => {
        const ids = itemIds;
        const locale = i18n.locale;
        let live = true;
        void (async () => {
            const resolved = await resolveItemListVisuals(ids, locale);
            if (live) visuals = resolved;
        })();
        return () => (live = false);
    });

    onMount(() => {
        void loadRankTiers().then((r) => (tiers = r));
        return onHeroesRefreshed((h) => (heroes = h));
    });
</script>

<TeamBoard {boards} {heroes} {tiers} {visuals} bans={summary.bans} averageBadge={summary.averageBadge} {versus} />
