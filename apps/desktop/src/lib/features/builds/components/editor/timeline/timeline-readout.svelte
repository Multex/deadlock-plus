<script lang="ts">
    import type { Snippet } from "svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { StatTotal } from "../../../stats";

    let {
        left,
        souls,
        level,
        time,
        stats,
        width = $bindable(0),
        header,
    }: {
        left: number;
        souls: number;
        level: number | null;
        time: string | null;
        stats: readonly StatTotal[];
        width?: number;
        header?: Snippet;
    } = $props();

    const context = $derived(
        [
            level === null ? null : t("builds.editor.timeline.level", { level }),
            time === null ? null : t("builds.editor.timeline.time", { time }),
        ]
            .filter((part) => part !== null)
            .join(" · "),
    );
</script>

<div
    bind:offsetWidth={width}
    class="pointer-events-none absolute bottom-full z-20 mb-1.5 w-max max-w-[30rem] min-w-40 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
    style:left="{left}px"
    role="tooltip"
    data-testid="timeline-readout"
>
    {#if header}
        <div class="mb-1 flex items-center gap-1.5 border-b border-border pb-1">{@render header()}</div>
    {/if}
    <p class="font-medium tabular-nums">{t("builds.editor.timeline.souls", { souls: formatNumber(souls) })}</p>
    {#if context}
        <p class="text-muted-foreground">{context}</p>
    {/if}
    {#if stats.length > 0}
        <div
            class={[
                "mt-1 grid gap-x-3 border-t border-border pt-1",
                stats.length > 8 ? "grid-cols-[1fr_auto_1fr_auto]" : "grid-cols-[1fr_auto]",
            ]}
        >
            {#each stats as stat (`${stat.provides}:${stat.unit}`)}
                <span class="truncate text-muted-foreground">{stat.label}</span>
                <span class="text-right tabular-nums">+{formatNumber(stat.total)}{stat.unit ?? ""}</span>
            {/each}
        </div>
    {/if}
</div>
