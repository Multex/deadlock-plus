<script lang="ts">
    import { onMount } from "svelte";
    import { Check, ChevronRight, Minus } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { replayCount, sharedRows, sourceCounts, SOURCE_LABEL_KEY } from "$lib/features/ingest/shared";
    import { sharedMatches } from "$lib/features/ingest/shared.svelte";

    const matches = $derived(sharedMatches.matches);
    const counts = $derived(matches ? sourceCounts(matches) : []);
    const replays = $derived(matches ? replayCount(matches) : 0);
    const rows = $derived(matches ? sharedRows(matches, Date.now() / 1000) : []);

    onMount(() => void sharedMatches.refresh());

    function ontoggle(event: Event) {
        if ((event.currentTarget as HTMLDetailsElement).open) void sharedMatches.refresh();
    }
</script>

<details class="group mt-3" {ontoggle}>
    <summary
        class="flex w-fit cursor-pointer flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
        <ChevronRight class="size-4 shrink-0 transition-transform group-open:rotate-90" />
        {t("settings.privacy.shared.title")}
        {#if counts.length}
            <span class="flex flex-wrap items-center gap-1.5 font-normal">
                {#each counts as c (c.source)}
                    <Badge variant="outline" class="text-muted-foreground tabular-nums">
                        {t(SOURCE_LABEL_KEY[c.source])}
                        {formatNumber(c.count)}
                    </Badge>
                {/each}
                {#if replays}
                    <Badge variant="secondary" class="tabular-nums">
                        {t("settings.privacy.shared.with_replay", { count: formatNumber(replays) })}
                    </Badge>
                {/if}
            </span>
        {/if}
    </summary>
    {#if sharedMatches.failed}
        <RegionError
            name="shared-matches"
            size="sm"
            class="mt-2"
            title={t("settings.privacy.shared.load_error")}
            body={t("region.error_body")}
            retryLabel={t("region.retry")}
            onretry={() => void sharedMatches.refresh()}
        />
    {:else if matches && rows.length === 0}
        <p class="mt-2 ml-6 text-xs text-muted-foreground">{t("settings.privacy.shared.empty")}</p>
    {:else if rows.length}
        <div class="mt-3 max-h-80 overflow-y-auto rounded-md border border-border/60">
            <table class="w-full text-xs">
                <thead class="sticky top-0 bg-card text-muted-foreground">
                    <tr class="border-b border-border/60 text-left">
                        <th class="px-3 py-2 font-medium">{t("settings.privacy.shared.when")}</th>
                        <th class="px-3 py-2 font-medium">{t("settings.privacy.shared.match")}</th>
                        <th class="px-3 py-2 font-medium">{t("settings.privacy.shared.from")}</th>
                        <th class="w-20 px-3 py-2 text-center font-medium">{t("settings.privacy.shared.details")}</th>
                        <th class="w-20 px-3 py-2 text-center font-medium">{t("settings.privacy.shared.replay")}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each rows as row (row.matchId)}
                        <tr class="border-b border-border/40 last:border-0 hover:bg-accent/40">
                            <td class="px-3 py-1.5 text-muted-foreground tabular-nums">{row.when}</td>
                            <td class="px-3 py-1.5">
                                <a href={row.href} class="font-medium tabular-nums hover:underline">{row.matchId}</a>
                            </td>
                            <td class="px-3 py-1.5 text-muted-foreground">{t(SOURCE_LABEL_KEY[row.source])}</td>
                            {#each [row.details, row.replay] as sent, i (i)}
                                <td class="px-3 py-1.5">
                                    {#if sent}
                                        <Check
                                            class="mx-auto size-3.5 text-success"
                                            aria-label={t("settings.privacy.shared.sent")}
                                        />
                                    {:else}
                                        <Minus
                                            class="mx-auto size-3.5 text-muted-foreground"
                                            aria-label={t("settings.privacy.shared.not_sent")}
                                        />
                                    {/if}
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</details>
