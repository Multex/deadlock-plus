<script lang="ts">
    import { onMount } from "svelte";

    import { i18n } from "$lib/core/i18n.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadRankTiers } from "$lib/features/ranks/ranks";
    import { keepGameArt } from "$lib/features/gamedata/art-refresh";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import type { IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
    import { resolveItemListVisuals } from "../../deep-dive/catalog";
    import { allPlayers, type MatchDetail } from "@deadlock-plus/match/detail";
    import { boardTeams, headerSummary } from "@deadlock-plus/match/scoreboard";
    import type { Versus } from "@deadlock-plus/match/versus";
    import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
    import { liveGradeDeps, watchMatchGrade } from "../../mvp";
    import TeamBoard from "./team-board.svelte";

    let {
        detail,
        ownAccountId,
        versus = null,
    }: { detail: MatchDetail; ownAccountId: number | null; versus?: Versus | null } = $props();

    let heroes = $state<Record<number, Hero>>({});
    let tiers = $state.raw<RankTier[]>([]);
    let visuals = $state.raw<ReadonlyMap<number, IdVisual>>(new Map());
    let grade = $state.raw<MvpMatchGrade | null>(null);

    const boards = $derived(boardTeams(detail, ownAccountId));
    const summary = $derived(headerSummary(detail, ownAccountId));
    const heroIds = $derived([...new Set(allPlayers(detail).map((p) => p.heroId))]);
    const matchId = $derived(detail.matchId);
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
        const stopArt = keepGameArt(async () => {
            const resolved = await resolveItemListVisuals(ids, locale);
            if (live) visuals = resolved;
        });
        return () => {
            live = false;
            stopArt();
        };
    });

    $effect(() => {
        const id = matchId;
        grade = null;
        return watchMatchGrade(id, liveGradeDeps, (g) => (grade = g));
    });

    onMount(() => {
        const stopArt = keepGameArt(() => loadRankTiers().then((r) => (tiers = r)));
        const stopHeroes = onHeroesRefreshed((h) => (heroes = h));
        return () => {
            stopArt();
            stopHeroes();
        };
    });
</script>

<TeamBoard
    {boards}
    {heroes}
    {tiers}
    {visuals}
    bans={summary.bans}
    averageBadge={summary.averageBadge}
    {versus}
    {grade}
/>
