<script lang="ts">
    import { LoaderCircle, Pause, RotateCw } from "@lucide/svelte";

    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { matchCoverage } from "$lib/features/match-history/coverage.svelte";
    import { recoveryPanel } from "$lib/features/match-history/recovery-panel.svelte";

    // Past this many recent matches the pips get too thin to read, so the tile falls back to a bar.
    const MAX_PIPS = 30;

    $effect(() => matchCoverage.sync());

    const summary = $derived(matchCoverage.summary);
    const run = $derived(matchCoverage.run);
    const hasAction = $derived(summary !== null && (run !== null || summary.missing > 0));

    const open = () => (recoveryPanel.open = true);
</script>

{#snippet track(done: number, total: number, label: string)}
    <div class="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
        {#if done > 0}
            <span class="h-full bg-primary" style="flex: {done} 1 0%"></span>
        {/if}
        {#if total - done > 0 || total === 0}
            <span class="h-full bg-muted-foreground/30" style="flex: {Math.max(total - done, 1)} 1 0%"></span>
        {/if}
    </div>
{/snippet}

{#if summary}
    {@const detailsLabel = t("match_history.coverage.details_aria", {
        full: formatNumber(summary.full),
        total: formatNumber(summary.total),
    })}
    {@const replaysLabel = t("match_history.coverage.replays_aria", {
        replays: formatNumber(summary.replays),
        recent: formatNumber(summary.recent),
    })}
    <dl
        class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border {hasAction
            ? 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]'
            : 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'}"
        aria-label={t("match_history.coverage.label")}
    >
        <div class="bg-card px-4 py-3">
            <dt class="text-xs text-muted-foreground">{t("match_history.coverage.details")}</dt>
            <dd class="mt-0.5 font-heading text-2xl tabular-nums">
                {formatNumber(summary.full)}<span class="ml-1 text-base text-muted-foreground"
                    >/ {formatNumber(summary.total)}</span
                >
            </dd>
            <dd class="mt-1.5">{@render track(summary.full, summary.total, detailsLabel)}</dd>
        </div>

        <div class="bg-card px-4 py-3">
            <dt class="text-xs text-muted-foreground">{t("match_history.coverage.replays")}</dt>
            <dd class="mt-0.5 font-heading text-2xl tabular-nums">
                {formatNumber(summary.replays)}<span class="ml-1 text-base text-muted-foreground"
                    >/ {formatNumber(summary.recent)}</span
                >
            </dd>
            <dd class="mt-1.5">
                {#if summary.recent > 0 && summary.recent <= MAX_PIPS}
                    <div class="flex gap-0.5" role="img" aria-label={replaysLabel}>
                        {#each { length: summary.recent } as _, i (i)}
                            <span
                                class="h-1.5 flex-1 rounded-full {i < summary.replays
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground/30'}"
                            ></span>
                        {/each}
                    </div>
                {:else}
                    {@render track(summary.replays, summary.recent, replaysLabel)}
                {/if}
            </dd>
        </div>

        {#if hasAction}
            <div class="col-span-2 flex items-center bg-card px-4 py-3 md:col-span-1">
                {#if run}
                    <Button variant="outline" onclick={open}>
                        {#if run.paused}
                            <Pause class="text-brass" aria-hidden="true" />
                        {:else}
                            <LoaderCircle
                                class="animate-spin text-brass motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        {/if}
                        <span class="tabular-nums">
                            {t(run.paused ? "match_history.coverage.paused" : "match_history.coverage.recovering", {
                                done: formatNumber(run.done),
                                total: formatNumber(run.total),
                            })}
                        </span>
                    </Button>
                {:else}
                    <Button onclick={open}>
                        <RotateCw aria-hidden="true" />
                        {t("match_history.coverage.recover", { count: formatNumber(summary.missing) })}
                    </Button>
                {/if}
            </div>
        {/if}
    </dl>
{/if}
