<script lang="ts">
    import type { Snippet } from "svelte";
    import { Ellipsis, Swords, Target } from "@lucide/svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import { reduceDamageMatrix } from "../../../deep-dive/damage";
    import { allPlayers, type MatchDetail } from "../../../detail";
    import HeroChip from "./hero-chip.svelte";
    import SectionCard from "./section-card.svelte";

    let {
        detail,
        selectedSlot,
        heroes,
        actions,
    }: { detail: MatchDetail; selectedSlot: number; heroes: Record<number, Hero>; actions?: Snippet } = $props();

    const players = $derived(allPlayers(detail));
    const table = $derived(reduceDamageMatrix(detail));
    const available = $derived(table.max > 0 || table.rows.some((r) => r.other > 0));
    const playerOf = (slot: number) => players.find((p) => p.slot === slot);
    const shade = (v: number) => (table.max > 0 ? Math.round((v / table.max) * 60) : 0);
</script>

<SectionCard title={t("match_history.deep_dive.damage.heading")} icon={Swords} {available} {actions}>
    <div class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
            <caption class="sr-only">{t("match_history.deep_dive.damage.hint")}</caption>
            <thead>
                <tr>
                    <th class="p-1 text-left font-normal text-muted-foreground">
                        <span class="inline-flex items-center gap-1" title={t("match_history.deep_dive.damage.hint")}>
                            <Swords size={14} aria-hidden="true" />
                            {t("match_history.deep_dive.damage.dealer")}
                            <Target size={14} aria-hidden="true" />
                            {t("match_history.deep_dive.damage.target")}
                        </span>
                    </th>
                    {#each players as p (p.slot)}
                        <th class="p-1 font-normal">
                            <span class="inline-flex justify-center">
                                <HeroChip
                                    heroId={p.heroId}
                                    {heroes}
                                    team={p.team}
                                    size={22}
                                    emphasised={p.slot === selectedSlot}
                                />
                            </span>
                        </th>
                    {/each}
                    <th class="p-1 text-right font-normal text-muted-foreground">
                        <span
                            class="inline-flex items-center gap-1"
                            title={t("match_history.deep_dive.damage.other_hint")}
                        >
                            <Ellipsis size={16} aria-hidden="true" />
                            {t("match_history.deep_dive.damage.other")}
                        </span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each table.rows as row (row.slot)}
                    {@const dealer = playerOf(row.slot)}
                    <tr class={row.slot === selectedSlot ? "font-medium" : ""}>
                        <th class="p-1 text-left font-normal">
                            <HeroChip
                                heroId={dealer?.heroId ?? null}
                                {heroes}
                                team={dealer?.team}
                                size={22}
                                emphasised={row.slot === selectedSlot}
                            />
                        </th>
                        {#each players as p (p.slot)}
                            {@const v = row.cells.get(p.slot)}
                            {@const friendly = dealer !== undefined && dealer.team === p.team}
                            <td
                                class="rounded p-1 text-center"
                                class:text-muted-foreground={friendly}
                                style:background={v
                                    ? `color-mix(in oklab, var(--color-primary) ${shade(v)}%, transparent)`
                                    : undefined}
                            >
                                {v === undefined ? (p.slot === row.slot ? "" : "–") : formatNumber(Math.round(v))}
                            </td>
                        {/each}
                        <td class="p-1 text-right text-muted-foreground">
                            {row.other > 0 ? formatNumber(Math.round(row.other)) : "–"}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</SectionCard>
