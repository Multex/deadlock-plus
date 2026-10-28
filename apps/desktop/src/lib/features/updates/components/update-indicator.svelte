<script lang="ts">
    import { indicatorLabel } from "../copy";
    import { indicatorKind } from "../flow";
    import { updateSurface } from "../update-surface.svelte";
    import IndicatorFace from "./indicator-face.svelte";

    const source = $derived(updateSurface.source);
    const kind = $derived(indicatorKind(source));
    const label = $derived(kind ? indicatorLabel(source) : "");
</script>

{#if kind}
    <button
        type="button"
        class="flex h-full items-center transition-colors hover:bg-accent/60"
        aria-label={label}
        title={label}
        onclick={() => updateSurface.show()}
    >
        <IndicatorFace {kind} {source} />
    </button>
{/if}
