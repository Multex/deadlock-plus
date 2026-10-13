<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
    import { allPlayers, findPlayer, type MatchDetail } from "@deadlock-plus/match/detail";
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
        {#snippet progressPicker()}
            <PlayerPicker
                {detail}
                {heroes}
                selectedSlot={selected.slot}
                ownSlot={own?.slot ?? null}
                label={t("match_history.deep_dive.progress.picker_aria")}
                onpick={(slot) => (pickedSlot = slot)}
            />
        {/snippet}

        {#snippet purchasesPicker()}
            <PlayerPicker
                {detail}
                {heroes}
                selectedSlot={selected.slot}
                ownSlot={own?.slot ?? null}
                label={t("match_history.deep_dive.purchases.picker_aria")}
                onpick={(slot) => (pickedSlot = slot)}
            />
        {/snippet}

        {#snippet damagePicker()}
            <PlayerPicker
                {detail}
                {heroes}
                selectedSlot={selected.slot}
                ownSlot={own?.slot ?? null}
                label={t("match_history.deep_dive.damage.picker_aria")}
                onpick={(slot) => (pickedSlot = slot)}
            />
        {/snippet}

        {#snippet accoladesPicker()}
            <PlayerPicker
                {detail}
                {heroes}
                selectedSlot={selected.slot}
                ownSlot={own?.slot ?? null}
                label={t("match_history.deep_dive.accolades.picker_aria")}
                onpick={(slot) => (pickedSlot = slot)}
            />
        {/snippet}

        <ProgressCharts {detail} {selected} {heroes} actions={progressPicker} />
        <Purchases {selected} actions={purchasesPicker} />
        <Damage {detail} selectedSlot={selected.slot} {heroes} actions={damagePicker} />
        <Objectives {detail} />
        <Accolades {selected} actions={accoladesPicker} />
    {/if}
</div>
