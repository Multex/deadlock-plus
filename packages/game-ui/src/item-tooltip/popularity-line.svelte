<script lang="ts">
    import { gameText } from "../text";
    import type { ItemTooltipModel } from "./model";

    let { popularity }: { popularity: NonNullable<ItemTooltipModel["popularity"]> } = $props();

    const t = gameText();
    let failed = $state<string | null>(null);
    const icon = $derived(popularity.heroIcon && failed !== popularity.heroIcon ? popularity.heroIcon : null);
</script>

<!-- `#PopularityContainer`: the hero's 30 px minimap icon and an oracle italic line in brandGreen, from the left. -->
<div class="popularity">
    {#if icon}
        <img class="hero" src={icon} alt="" draggable="false" onerror={() => (failed = icon)} />
    {:else}
        <span class="hero fallback" aria-hidden="true"></span>
    {/if}
    <span class="label">{t(popularity.text)}</span>
</div>

<style>
    .popularity {
        display: flex;
        align-items: center;
        padding: calc(var(--u) * 5) calc(var(--u) * 20);
    }
    .hero {
        width: calc(var(--u) * 30);
        height: calc(var(--u) * 30);
        flex: none;
        object-fit: contain;
    }
    .hero.fallback {
        border-radius: 50%;
        background: var(--tt-popularity-fallback);
    }
    .label {
        margin: calc(var(--u) * 8) calc(var(--u) * 8) calc(var(--u) * 8) calc(var(--u) * 10);
        color: var(--game-brand-green, #5fe69e);
        font-family: var(--game-font-oracle);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-style: italic;
        font-weight: 500;
        /* Measured: this italic line sits taller than the other oracle labels. */
        line-height: calc(var(--u) * 16 * 1.48);
    }
</style>
