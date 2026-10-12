<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import { Coins, Crosshair, HeartPulse, Medal, Package, Shield, Skull, Swords, Target, Users } from "@lucide/svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import { resolveAccoladeInfo, type AccoladeInfo } from "../../../deep-dive/accolade-catalog";
    import {
        accoladeCategory,
        accoladeTier,
        renderAccoladeDescription,
        type AccoladeCategory,
    } from "../../../deep-dive/accolade-text";
    import type { MatchAccolade, MatchPlayer } from "../../../detail";
    import SectionCard from "./section-card.svelte";

    let { selected, actions }: { selected: MatchPlayer; actions?: Snippet } = $props();

    type Icon = Component<{ size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    const ICONS: Record<AccoladeCategory, Icon> = {
        kills: Skull,
        assists: Users,
        healing: HeartPulse,
        damage: Swords,
        headshots: Crosshair,
        souls: Coins,
        farming: Target,
        objects: Package,
        defence: Shield,
        other: Medal,
    };

    let info = $state.raw(new Map<number, AccoladeInfo>());
    let token = 0;

    $effect(() => {
        const ids = [...new Set(selected.accolades.map((a) => a.accoladeId))];
        const locale = i18n.locale;
        const mine = ++token;
        void resolveAccoladeInfo(ids, locale).then((found) => {
            if (mine === token) info = found;
        });
    });

    const num = (v: number) => formatNumber(Math.round(v));

    const entries = $derived(
        selected.accolades.map((a: MatchAccolade) => {
            const known = info.get(a.accoladeId);
            const description = known?.description
                ? renderAccoladeDescription(known.description, Math.round(a.value), i18n.locale, formatNumber)
                : null;
            return {
                key: `${a.accoladeId}-${a.tier}`,
                name: known?.name ?? t("match_history.deep_dive.names.accolade"),
                description,
                value: num(a.value),
                tier: accoladeTier(a.tier),
                Glyph: ICONS[accoladeCategory(known?.trackedStat)],
            };
        }),
    );
</script>

<SectionCard
    title={t("match_history.deep_dive.accolades.heading")}
    icon={Medal}
    available={selected.accolades.length > 0}
    {actions}
>
    <ul class="grid gap-2 sm:grid-cols-2">
        {#each entries as e (e.key)}
            <li class="flex items-start gap-3 rounded-lg border border-border p-2.5">
                <span
                    class="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                    <e.Glyph size={16} aria-hidden="true" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                    <span class="flex items-baseline justify-between gap-2">
                        <span class="truncate text-sm font-medium">{e.name}</span>
                        {#if e.tier !== null}
                            <span
                                class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                            >
                                {t("match_history.deep_dive.accolades.tier", { tier: e.tier })}
                            </span>
                        {/if}
                    </span>
                    <span class="text-xs tabular-nums text-muted-foreground">{e.description ?? e.value}</span>
                </span>
            </li>
        {/each}
    </ul>
    <p class="mt-3 text-xs text-muted-foreground">{t("match_history.deep_dive.accolades.hint")}</p>
</SectionCard>
