<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { openLink } from "$lib/core/open-link";
    import { releaseHighlights, releaseNotesUrl, type UpdateChannel } from "../flow";

    type Props = {
        version: string;
        notes: string | null | undefined;
        channel: UpdateChannel;
    };

    let { version, notes, channel }: Props = $props();

    const id = $props.id();
    const highlights = $derived(releaseHighlights(version, notes));
    const shown = $derived(highlights.headlines);
    const more = $derived(Math.max(highlights.total - shown.length, 0));
</script>

{#if shown.length > 0}
    <section class="highlights" aria-labelledby="{id}-title">
        <h3 id="{id}-title" class="kicker">{t("updates.surface.highlights_title")}</h3>
        <ol>
            {#each shown as headline, i (i)}
                <li>
                    <span class="num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                    <div class="min-w-0">
                        <p class="title">{headline.title}</p>
                        {#if headline.lead}
                            <p class="lead">{headline.lead}</p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
        <div class="foot">
            {#if more > 0}
                <span>{tn("updates.surface.more_changes", more)}</span>
            {/if}
            <button type="button" class="notes-link" onclick={() => void openLink(releaseNotesUrl(channel, version))}>
                {t("updates.surface.action.notes")}
                <ExternalLink class="size-3.5" aria-hidden="true" />
            </button>
        </div>
    </section>
{/if}

<style>
    .highlights {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .kicker {
        font-family: var(--font-heading);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brass);
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .kicker::after {
        content: "";
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, color-mix(in oklch, var(--brass) 50%, transparent), transparent);
    }

    ol {
        display: flex;
        flex-direction: column;
    }

    li {
        display: flex;
        gap: 0.875rem;
        align-items: baseline;
        padding: 0.625rem 0;
        border-top: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
    }
    li:first-child {
        border-top: 0;
        padding-top: 0;
    }

    .num {
        flex-shrink: 0;
        font-family: "Valve Pulp", var(--font-heading);
        font-size: 1.35rem;
        line-height: 1;
        color: color-mix(in oklch, var(--brass) 75%, var(--foreground));
        font-variant-numeric: tabular-nums;
    }

    .title {
        font-family: var(--font-heading);
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--foreground);
    }

    .lead {
        margin-top: 0.125rem;
        font-size: 0.85rem;
        color: var(--muted-foreground);
    }

    .foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem 1rem;
        font-size: 0.8rem;
        color: var(--muted-foreground);
    }

    .notes-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        color: var(--brass);
        text-underline-offset: 3px;
    }
    .notes-link:hover {
        text-decoration: underline;
    }
</style>
