<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import { goto } from "$app/navigation";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import type { ChangelogEntry } from "../changelog";
    import { recentReleases, releaseCadenceDays } from "../flow";
    import { WHATS_NEW_ROUTE } from "../whats-new";

    let { history, current }: { history: ChangelogEntry[]; current: string } = $props();

    const SHOWN = 4;
    const id = $props.id();
    const releases = $derived(recentReleases(history, current, SHOWN));
    const cadence = $derived(releaseCadenceDays(history));

    function dateLabel(date: string): string {
        const at = Date.parse(date);
        return Number.isNaN(at) ? date : formatDate(at, { day: "numeric", month: "short", year: "numeric" });
    }
</script>

<section class="history" aria-labelledby="{id}-title">
    <h2 id="{id}-title" class="title">{t("updates.history.title")}</h2>
    <ol>
        {#each releases as release (release.version)}
            <li data-installed={release.installed}>
                <span class="mark" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                    <p class="line">
                        <span class="version">{release.version}</span>
                        {#if release.installed}<span class="tag">{t("updates.history.installed")}</span>{/if}
                        {#if release.date}<span class="date">{dateLabel(release.date)}</span>{/if}
                    </p>
                    {#if release.headlines.length > 0}
                        <p class="headlines">{release.headlines.join(" · ")}</p>
                    {/if}
                </div>
            </li>
        {/each}
    </ol>
    <div class="foot">
        {#if cadence !== null}<span>{tn("updates.history.cadence", cadence)}</span>{/if}
        <button type="button" class="all" onclick={() => void goto(WHATS_NEW_ROUTE)}>
            {t("updates.history.all")}
            <ChevronRight class="size-3.5" aria-hidden="true" />
        </button>
    </div>
</section>

<style>
    .history {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
    }

    .title {
        font-family: var(--font-heading);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brass);
    }

    ol {
        position: relative;
        display: flex;
        flex-direction: column;
    }
    /* The rail the release marks hang on. */
    ol::before {
        content: "";
        position: absolute;
        top: 0.5rem;
        bottom: 0.5rem;
        left: 4px;
        width: 1px;
        background: linear-gradient(
            180deg,
            color-mix(in oklch, var(--brass) 55%, transparent),
            color-mix(in oklch, var(--border) 60%, transparent)
        );
    }

    li {
        position: relative;
        display: flex;
        gap: 1rem;
        padding: 0.5rem 0;
    }

    .mark {
        flex-shrink: 0;
        width: 9px;
        height: 9px;
        margin-top: 0.3rem;
        transform: rotate(45deg);
        border: 1px solid color-mix(in oklch, var(--brass) 60%, var(--border));
        background: var(--card);
    }
    li[data-installed="true"] .mark {
        background: var(--brass);
        border-color: var(--brass);
        box-shadow: 0 0 8px color-mix(in oklch, var(--brass) 45%, transparent);
    }

    .line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.25rem 0.625rem;
    }

    .version {
        font-family: "Valve Pulp", var(--font-heading);
        font-size: 1rem;
        line-height: 1.1;
        color: var(--foreground);
        font-variant-numeric: tabular-nums;
    }

    .tag {
        padding: 0 0.375rem;
        border: 1px solid color-mix(in oklch, var(--brass) 50%, transparent);
        border-radius: 2px;
        font-family: var(--font-heading);
        font-size: 0.62rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .date {
        margin-left: auto;
        font-size: 0.78rem;
        color: var(--muted-foreground);
    }

    .headlines {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        margin-top: 0.125rem;
        font-size: 0.82rem;
        color: var(--muted-foreground);
    }

    .foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem 1rem;
        padding-top: 0.25rem;
        border-top: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
        font-size: 0.8rem;
        color: var(--muted-foreground);
    }

    .all {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--brass);
        text-underline-offset: 3px;
    }
    .all:hover {
        text-decoration: underline;
    }
</style>
