<script lang="ts">
    import { ChevronRight, RefreshCw } from "@lucide/svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { scanPercent } from "../performance";
    import { performanceScan } from "../scan.svelte";
    import AddonMeta from "./addon-meta.svelte";
    import FlaggedAddon from "./flagged-addon.svelte";
    import SummaryTile from "./summary-tile.svelte";

    const listing = $derived(performanceScan.listing);
    const scans = $derived(performanceScan.scans);
    const failures = $derived(performanceScan.failures);
    const error = $derived(performanceScan.error);
    const scanning = $derived(performanceScan.scanning);
    const paused = $derived(performanceScan.paused);
    const addons = $derived(performanceScan.addons);
    const summary = $derived(performanceScan.summary);
    const groups = $derived(performanceScan.groups);
    const percent = $derived(scanPercent(performanceScan.done, addons.length));
</script>

<div class="flex items-start justify-between gap-4">
    <p class="text-sm text-muted-foreground">
        {t("performance.scripts.intro")}
    </p>
    <Button variant="outline" size="sm" onclick={() => performanceScan.run()} disabled={scanning && !paused}>
        <RefreshCw class={scanning && !paused ? "animate-spin" : ""} />
        {paused
            ? t("performance.scripts.run_now")
            : scanning
              ? t("performance.scripts.scanning_button")
              : t("performance.scripts.scan_again")}
    </Button>
</div>

<Card radius="md" padding="row" class="text-sm text-muted-foreground">
    {t("performance.scripts.disclaimer")}
</Card>

{#if error}
    <div role="alert" class="flex flex-1 items-center justify-center text-sm text-destructive">{error}</div>
{:else if listing && listing.dir === null}
    <EmptyState as="div" layout="fill">
        {t("performance.scripts.no_install")}
    </EmptyState>
{:else if listing && addons.length === 0}
    <EmptyState as="div" layout="fill">{t("performance.scripts.none_installed")}</EmptyState>
{:else if !listing}
    <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("performance.scripts.finding")}
    </div>
{:else}
    {#if scanning}
        <Card radius="md" padding="row" class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3 text-sm">
                <span>
                    {paused
                        ? t("performance.scripts.progress_paused", { done: performanceScan.done, total: addons.length })
                        : t("performance.scripts.progress", { done: performanceScan.done, total: addons.length })}
                </span>
                <span class="truncate font-mono text-xs text-muted-foreground">{performanceScan.current}</span>
            </div>
            <div
                class="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20"
                role="progressbar"
                aria-label={t("performance.scripts.progress_aria")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
            >
                <div
                    class="h-full rounded-full bg-brass transition-[width] duration-300"
                    style="width: {percent}%"
                ></div>
            </div>
        </Card>
    {/if}

    <div class="grid grid-cols-3 gap-3">
        <SummaryTile
            label={tn("performance.scripts.with_findings", summary.findings)}
            value={summary.flagged}
            tone={summary.flagged > 0 ? "text-warning" : ""}
        />
        <SummaryTile
            label={t("performance.scripts.scripts_clean")}
            value={summary.clean}
            tone={summary.clean > 0 ? "text-success" : ""}
        />
        <SummaryTile label={t("performance.scripts.no_scripts")} value={summary.noScripts} />
    </div>

    {#if groups.flagged.length > 0}
        <section class="flex flex-col gap-2">
            <h2 class="px-1 text-sm font-medium text-muted-foreground">{t("performance.scripts.worth_a_look")}</h2>
            <ul class="flex flex-col gap-2">
                {#each groups.flagged as addon (addon.fileName)}
                    <FlaggedAddon {addon} scan={scans[addon.fileName]} />
                {/each}
            </ul>
        </section>
    {/if}

    {#if groups.failed.length > 0}
        <section class="flex flex-col gap-2">
            <h2 class="px-1 text-sm font-medium text-muted-foreground">{t("performance.scripts.could_not_read")}</h2>
            <ul class="flex flex-col gap-1.5">
                {#each groups.failed as addon (addon.fileName)}
                    <Card as="li" radius="md" padding="row">
                        <div class="flex items-center gap-3">
                            <AddonMeta {addon} />
                            <Badge variant="destructive">{t("performance.scripts.error_badge")}</Badge>
                        </div>
                        <p class="mt-2 text-sm text-destructive">{failures[addon.fileName]}</p>
                    </Card>
                {/each}
            </ul>
        </section>
    {/if}

    {#if groups.clean.length > 0}
        <section class="flex flex-col gap-2">
            <h2 class="px-1 text-sm font-medium text-muted-foreground">{t("performance.scripts.scanned_clean")}</h2>
            <ul class="flex flex-col gap-1.5">
                {#each groups.clean as addon (addon.fileName)}
                    {@const scan = scans[addon.fileName]}
                    <Card as="li" radius="md" padding="row" class="flex items-center gap-3">
                        <AddonMeta {addon} {scan} />
                        <Badge variant="success">{tn("performance.scripts.scripts_count", scan.scriptsScanned)}</Badge>
                    </Card>
                {/each}
            </ul>
        </section>
    {/if}

    {#if groups.pending.length > 0}
        <p class="px-1 text-sm text-muted-foreground">
            {tn("performance.scripts.pending", groups.pending.length)}
        </p>
    {/if}

    {#if groups.noScripts.length > 0}
        <details class="group rounded-md border border-border bg-card">
            <summary class="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm">
                <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <span class="flex-1 text-muted-foreground">
                    {tn("performance.scripts.addons_without_scripts", groups.noScripts.length)}
                </span>
            </summary>
            <ul class="flex flex-col divide-y divide-border border-t border-border">
                {#each groups.noScripts as addon (addon.fileName)}
                    <li class="flex items-center gap-3 px-4 py-2">
                        <AddonMeta {addon} scan={scans[addon.fileName]} />
                    </li>
                {/each}
            </ul>
        </details>
    {/if}
{/if}
