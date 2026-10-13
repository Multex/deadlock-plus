<script lang="ts">
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
    import type { LivePhase } from "@deadlock-plus/ipc-types/LivePhase";
    import { live } from "../live.svelte";
    import { orderTeams } from "../live";
    import MatchHeader from "./match-header.svelte";
    import SwapsNotice from "./swaps-notice.svelte";
    import TeamTable from "./team-table.svelte";

    let {
        match,
        phase,
        heroes,
        tiers,
    }: { match: LiveMatch; phase: LivePhase; heroes: Record<number, Hero>; tiers: RankTier[] } = $props();

    const teams = $derived(orderTeams(match.teams, match.yourSide));
    const swapped = $derived(new Map(live.swaps.map((s) => [s.key, s])));
    const totalSouls = $derived(match.teams.reduce((sum, t) => sum + t.souls, 0));
</script>

<div class="flex flex-col gap-3">
    <MatchHeader {match} {phase} />
    <SwapsNotice swaps={live.swaps} teams={match.teams} {heroes} ondismiss={() => live.dismissSwaps()} />
    {#each teams as team (team.side)}
        <TeamTable
            {team}
            {totalSouls}
            clockSecs={match.clockSecs}
            pregame={phase === "pregame"}
            {heroes}
            {tiers}
            {swapped}
        />
    {/each}
</div>
