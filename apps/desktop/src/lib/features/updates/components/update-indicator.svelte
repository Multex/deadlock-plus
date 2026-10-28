<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { indicatorLabel } from "../copy";
    import { indicatorKind } from "../flow";
    import { updateSurface } from "../update-surface.svelte";
    import IndicatorFace from "./indicator-face.svelte";
    import UpdatePopover from "./update-popover.svelte";

    const source = $derived(updateSurface.source);
    const kind = $derived(indicatorKind(source));
    const label = $derived(kind ? indicatorLabel(source) : t("updates.surface.title"));
    // The popover hangs from this button, so it stays while the popover is open even with nothing to report.
    const popover = $derived(updateSurface.layout === "popover");
</script>

{#if popover && (kind || updateSurface.open)}
    <UpdatePopover surface={updateSurface} kind={kind ?? "idle"} {label} />
{:else if kind && !popover}
    <button
        type="button"
        class="flex h-full items-center px-2 transition-colors hover:bg-accent/60"
        aria-label={label}
        title={label}
        onclick={() => updateSurface.show()}
    >
        <IndicatorFace {kind} {source} />
    </button>
{/if}
