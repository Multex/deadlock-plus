<script lang="ts">
    import type { Hero } from "$lib/features/heroes/heroes";
    import HeroIcon from "$lib/features/live/components/hero-icon.svelte";
    import type { MatchTeam } from "@deadlock-plus/match/detail";

    let {
        heroId,
        heroes,
        team,
        size = 24,
        emphasised = false,
        dimmed = false,
    }: {
        heroId: number | null;
        heroes: Record<number, Hero>;
        team?: MatchTeam;
        size?: number;
        emphasised?: boolean;
        dimmed?: boolean;
    } = $props();

    const ring = $derived(team === undefined ? null : team === "hidden-king" ? "var(--dd-hk)" : "var(--dd-am)");
</script>

<span
    class="inline-flex shrink-0 rounded-[8px] p-px"
    class:opacity-60={dimmed}
    style:outline={ring ? `${emphasised ? 2 : 1}px solid ${ring}` : undefined}
    style:outline-offset="1px"
>
    <HeroIcon {heroId} {heroes} {size} />
</span>
