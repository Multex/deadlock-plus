<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { PatchSearchResult } from "@deadlock-plus/ipc-types/PatchSearchResult";
    import { formatPublished, searchResultKeys, sourceLabel } from "../alerts";

    type Props = {
        query: string;
        indexing: boolean;
        searching: boolean;
        results: PatchSearchResult[];
        onview: (result: PatchSearchResult) => void;
    };

    let { query, indexing, searching, results, onview }: Props = $props();

    const resultKeys = $derived(searchResultKeys(results));
</script>

{#if indexing}
    <div role="status" class="flex flex-1 items-center justify-center text-base text-muted-foreground">
        {t("alerts.indexing")}
    </div>
{:else if searching}
    <div role="status" class="flex flex-1 items-center justify-center text-base text-muted-foreground">
        {t("alerts.searching")}
    </div>
{:else if results.length === 0}
    <div
        role="status"
        class="flex flex-1 flex-col items-center justify-center gap-1 text-center text-base text-muted-foreground"
    >
        <p>{t("alerts.no_matches", { query })}</p>
        <p>{t("alerts.no_matches_hint")}</p>
    </div>
{:else}
    <ul class="flex flex-col gap-2">
        {#each results as r, i (resultKeys[i])}
            {@const date = formatPublished(r.published)}
            <li>
                <Button
                    type="button"
                    variant="unstyled"
                    class="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-4 hover:border-brass/50 hover:bg-accent/40"
                    onclick={() => onview(r)}
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" class="px-2.5 py-0.5 text-sm">{r.section}</Badge>
                        <Badge variant="outline" class="px-2.5 py-0.5 text-sm">{sourceLabel(r.origin)}</Badge>
                        <span class="text-sm font-medium text-foreground">{r.title}</span>
                        {#if date}<span class="text-sm text-muted-foreground">{date}</span>{/if}
                    </div>
                    <p class="text-base leading-relaxed text-foreground">{r.snippet}</p>
                </Button>
            </li>
        {/each}
    </ul>
{/if}
