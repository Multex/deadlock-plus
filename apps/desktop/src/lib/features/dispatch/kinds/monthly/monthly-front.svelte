<script lang="ts">
    import { onMount } from "svelte";
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import type { EditionView } from "../../edition-view";
    import { coverArt, type CoverArt } from "./art";
    import Cover from "./cover.svelte";
    import { magazineDeps } from "./deps";
    import { PAGE } from "./layout";
    import { buildMagazine } from "./magazine";

    let { edition, view }: { edition: Edition; view: EditionView } = $props();

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    let art = $state.raw<CoverArt>({ card: null, backdrop: null });

    const mag = $derived(buildMagazine(edition, view, magazineDeps(heroes, ranks)));
    const heroId = $derived(mag.coverHero?.heroId ?? null);

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        void loadApiRanks().then((r) => (ranks = r));
    });

    $effect(() => {
        const id = heroId;
        let live = true;
        if (id !== null) void coverArt(id).then((a) => live && (art = a));
        return () => (live = false);
    });
</script>

<div class="front" style="width: {PAGE.width}px; height: {PAGE.height}px;">
    {#key mag}
        <Cover {mag} {art} />
    {/key}
    <div class="spine" aria-hidden="true"></div>
</div>

<style>
    .front {
        position: relative;
        overflow: hidden;
    }

    .spine {
        position: absolute;
        inset: 0 auto 0 0;
        z-index: 7;
        width: 18px;
        background: linear-gradient(
            to right,
            rgb(0 0 0 / 0.45),
            rgb(255 255 255 / 0.22) 3px,
            rgb(0 0 0 / 0.18) 7px,
            rgb(255 255 255 / 0.08) 10px,
            transparent 18px
        );
    }
</style>
