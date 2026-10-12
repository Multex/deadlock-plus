<script lang="ts">
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
    import { allPlayers, findPlayer, type MatchDetail } from "../../detail";
    import Accolades from "./deep-dive/accolades.svelte";
    import Damage from "./deep-dive/damage.svelte";
    import Objectives from "./deep-dive/objectives.svelte";
    import PlayerPicker from "./deep-dive/player-picker.svelte";
    import ProgressCharts from "./deep-dive/progress-charts.svelte";
    import Purchases from "./deep-dive/purchases.svelte";

    let { detail, ownAccountIds = [] }: { detail: MatchDetail; ownAccountIds?: number[] } = $props();

    const players = $derived(allPlayers(detail));
    let pickedSlot = $state<number | null>(null);
    const own = $derived(findPlayer(detail, ownAccountIds));
    const selected = $derived(players.find((p) => p.slot === pickedSlot) ?? own ?? players[0]);

    let heroes = $state.raw<Record<number, Hero>>({});
    $effect(() => {
        const ids = players.map((p) => p.heroId);
        let live = true;
        void loadHeroes(ids).then((h) => {
            if (live) heroes = h;
        });
        return () => (live = false);
    });
</script>

<div class="flex flex-col gap-4" data-match-id={detail.matchId}>
    {#if selected}
        {#snippet picker()}
            <PlayerPicker
                {detail}
                {heroes}
                selectedSlot={selected.slot}
                ownSlot={own?.slot ?? null}
                onpick={(slot) => (pickedSlot = slot)}
            />
        {/snippet}

        <ProgressCharts {detail} {selected} {heroes} actions={picker} />
        <Purchases {selected} actions={picker} />
        <Damage {detail} selectedSlot={selected.slot} {heroes} actions={picker} />
        <Objectives {detail} />
        <Accolades {selected} actions={picker} />
    {/if}
</div>
