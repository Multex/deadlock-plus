<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Copy, Gauge, Save, Trash2 } from "@lucide/svelte";

    import { errorText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import { saveTextFile } from "$lib/core/files";

    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";

    import { formatDuration } from "$lib/features/performance/performance";
    import {
        addonDiff,
        compareLabel,
        compareRuns,
        comparisonReport,
        formatValue,
        type Better,
    } from "$lib/features/performance/runs";
    import { savedRuns } from "$lib/features/performance/runs.svelte";
    import { runItems } from "./compare-items";

    let aId = $state("");
    let bId = $state("");

    const runs = $derived(savedRuns.runs);
    const a = $derived(runs.find((r) => r.id === aId));
    const b = $derived(runs.find((r) => r.id === bId));
    const rows = $derived(a && b ? compareRuns(a, b) : []);
    const diff = $derived(a && b ? addonDiff(a, b) : { onlyInA: [], onlyInB: [] });
    const onlyInA = $derived(diff.onlyInA);
    const onlyInB = $derived(diff.onlyInB);
    const wins = $derived({
        a: rows.filter((r) => r.better === "a").length,
        b: rows.filter((r) => r.better === "b").length,
    });

    onMount(() => void savedRuns.load());

    async function copyReport() {
        if (!a || !b) return;
        try {
            await navigator.clipboard.writeText(comparisonReport(a, b));
            toast.success(t("performance.compare.copied"));
        } catch {
            toast.error(t("performance.compare.copy_failed"));
        }
    }

    async function saveReport() {
        if (!a || !b) return;
        try {
            const saved = await saveTextFile(
                {
                    defaultName: "deadlock-plus-comparison.txt",
                    filterName: t("performance.compare.file_filter"),
                    extension: "txt",
                },
                comparisonReport(a, b),
            );
            if (saved) toast.success(t("performance.compare.saved"));
        } catch (e) {
            toast.error(t("performance.compare.save_failed", { error: errorText(e) }));
        }
    }

    $effect(() => {
        if (runs.length >= 2 && !a && !b) {
            aId = runs[1].id;
            bId = runs[0].id;
        }
        if (aId && !a) aId = "";
        if (bId && !b) bId = "";
    });

    const fmt = formatValue;
    const cell = (better: Better, side: "a" | "b") =>
        better === side ? "font-semibold text-success" : "text-foreground";
    const date = (at: number) => formatDate(at, { dateStyle: "medium", timeStyle: "short" });
    const items = $derived(runItems(runs, t("performance.compare.pick_run"), date));
</script>

{#snippet picker(id: string, onchange: (v: string) => void, label: string)}
    <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <SelectMenu {items} value={id} onValueChange={onchange} triggerMeta class="w-full">
            {#snippet icon()}<Gauge aria-hidden="true" />{/snippet}
        </SelectMenu>
    </label>
{/snippet}

<div class="flex flex-col gap-4">
    <p class="text-sm text-muted-foreground">
        {t("performance.compare.intro")}
    </p>

    {#if runs.length < 2}
        <Card radius="md" padding="none" class="px-4 py-6 text-center text-sm text-muted-foreground">
            {runs.length === 0 ? t("performance.compare.empty_none") : t("performance.compare.empty_one")}
            {t("performance.compare.empty_hint")}
        </Card>
    {:else}
        <div class="flex gap-3">
            {@render picker(aId, (v) => (aId = v), t("performance.compare.run_a"))}
            {@render picker(bId, (v) => (bId = v), t("performance.compare.run_b"))}
        </div>

        {#if a && b}
            {#if a.id === b.id}
                <p class="text-sm text-warning">{t("performance.compare.pick_different")}</p>
            {:else}
                <Card radius="md" padding="none" class="overflow-hidden">
                    <table class="w-full text-sm">
                        <thead class="text-left text-xs text-muted-foreground">
                            <tr class="border-b border-border">
                                <th class="px-4 py-2 font-normal"></th>
                                <th class="px-4 py-2 font-normal">{a.label}</th>
                                <th class="px-4 py-2 font-normal">{b.label}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each rows as row (row.key)}
                                <tr class="border-b border-border last:border-0">
                                    <td class="px-4 py-2 text-muted-foreground">{compareLabel(row.key)}</td>
                                    <td class="px-4 py-2 font-mono {cell(row.better, 'a')}">{fmt(row.a, row.unit)}</td>
                                    <td class="px-4 py-2 font-mono {cell(row.better, 'b')}">{fmt(row.b, row.unit)}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </Card>
                <div class="flex gap-2">
                    <Button variant="outline" size="sm" onclick={copyReport}
                        ><Copy /> {t("performance.compare.copy_report")}</Button
                    >
                    <Button variant="outline" size="sm" onclick={saveReport}
                        ><Save /> {t("performance.compare.save_report")}</Button
                    >
                </div>
                <p class="text-xs text-muted-foreground">
                    {t("performance.compare.legend", {
                        a: formatDuration(a.stats.durationMs),
                        b: formatDuration(b.stats.durationMs),
                    })}
                    {#if wins.a === 0 && wins.b === 0}
                        {t("performance.compare.no_difference")}
                    {:else if wins.a > 0 && wins.b > 0}
                        {t("performance.compare.mixed", { a: wins.a, b: wins.b })}
                    {:else if wins.a > 0}
                        {t("performance.compare.favours_a")}
                    {:else}
                        {t("performance.compare.favours_b")}
                    {/if}
                </p>
                {#if onlyInA.length > 0 || onlyInB.length > 0}
                    <Card radius="md" padding="row" class="flex flex-col gap-2 text-sm">
                        <p class="text-xs text-muted-foreground">{t("performance.compare.addons_differ")}</p>
                        {#each [{ name: a.label, list: onlyInA }, { name: b.label, list: onlyInB }] as side}
                            {#if side.list.length > 0}
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="text-muted-foreground"
                                        >{t("performance.compare.only_on_in", { run: side.name })}</span
                                    >
                                    {#each side.list as name}<Badge variant="outline">{name}</Badge>{/each}
                                </div>
                            {/if}
                        {/each}
                    </Card>
                {:else}
                    <p class="text-xs text-warning">
                        {t("performance.same_addons")}
                    </p>
                {/if}
            {/if}
        {/if}

        <ul class="flex flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
            {#each runs as r (r.id)}
                <li class="flex items-center justify-between gap-3 px-4 py-2">
                    <div class="min-w-0">
                        <p class="truncate">{r.label}</p>
                        <p class="text-xs text-muted-foreground">
                            {date(r.savedAt)} · {formatDuration(r.stats.durationMs)} · {tn(
                                "performance.compare.addons_on",
                                r.addons.length,
                            )}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("performance.compare.delete_run", { label: r.label })}
                        onclick={() => savedRuns.remove(r.id)}
                    >
                        <Trash2 />
                    </Button>
                </li>
            {/each}
        </ul>
        {#if savedRuns.error}<p class="text-sm text-destructive">{savedRuns.error}</p>{/if}
    {/if}
</div>
