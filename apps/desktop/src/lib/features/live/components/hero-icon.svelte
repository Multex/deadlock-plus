<script lang="ts">
    import ArtImage from "@deadlock-plus/ui/art-image.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import { heroInitials } from "../live";

    let {
        heroId,
        heroes,
        size = 22,
    }: { heroId: number | null; heroes: Record<number, Hero>; size?: number } = $props();

    const hero = $derived(heroId === null ? null : (heroes[heroId] ?? null));
    const hue = $derived(((heroId ?? 0) * 47) % 360);
</script>

<ArtImage
    src={hero?.icon}
    alt={hero?.name ?? ""}
    title={hero?.name}
    class="inline-flex flex-none items-center justify-center rounded-[6px] object-cover"
    width={size}
    height={size}
    style="width: {size}px; height: {size}px"
>
    {#snippet fallback()}
        <span
            class="inline-flex size-full items-center justify-center text-[10px] font-bold text-[oklch(0.15_0.01_70)]"
            style:background="oklch(0.72 0.07 {hue})"
        >
            {heroInitials(hero?.name ?? null)}
        </span>
    {/snippet}
</ArtImage>
