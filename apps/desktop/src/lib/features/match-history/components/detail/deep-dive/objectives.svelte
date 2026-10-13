<script lang="ts">
    import type { Component } from "svelte";
    import {
        Castle,
        Crown,
        Flag,
        Gem,
        Landmark,
        Shield,
        ShieldCheck,
        ShieldHalf,
        Skull,
        Sparkles,
        Swords,
        Timer,
        Users,
    } from "@lucide/svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import { objectiveRows } from "@deadlock-plus/match/deep-dive/objective-rows";
    import { objectiveNameKey } from "../../../deep-dive/objective-rows";
    import type { ObjectiveKind } from "@deadlock-plus/match/deep-dive/names";
    import type { MatchDetail, MatchTeam } from "@deadlock-plus/match/detail";
    import LaneChip from "./lane-chip.svelte";
    import SectionCard from "./section-card.svelte";
    import TeamMark from "./team-mark.svelte";

    let { detail }: { detail: MatchDetail } = $props();

    type Icon = Component<{ size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    const clock = (s: number) => formatClock(Math.round(s)) ?? "";
    const num = (v: number) => formatNumber(Math.round(v));
    const teamName = (team: MatchTeam) =>
        team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");

    const rows = $derived(objectiveRows(detail.objectives));
    const bosses = $derived([...detail.midBoss].sort((a, b) => a.destroyedS - b.destroyedS));

    const KIND_ICONS: Record<ObjectiveKind, Icon> = {
        core: Gem,
        guardian: Shield,
        walker: Castle,
        patron: Crown,
        shrine: Landmark,
        base_guardian: ShieldCheck,
        unknown: ShieldHalf,
    };

    function kindName(kind: ObjectiveKind, index?: number): string {
        const name = t(objectiveNameKey(kind));
        return index === undefined ? name : t("match_history.deep_dive.objectives.indexed_name", { name, index });
    }
</script>

{#snippet columnIcon(Glyph: Icon, label: string)}
    <span class="inline-flex items-center gap-1">
        <Glyph size={14} aria-hidden="true" />
        {label}
    </span>
{/snippet}

<SectionCard
    title={t("match_history.deep_dive.objectives.heading")}
    icon={Castle}
    available={rows.length > 0 || bosses.length > 0}
>
    {#if rows.length > 0}
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="text-left text-xs text-muted-foreground">
                    <tr>
                        <th class="py-1 pr-3 font-normal">
                            {@render columnIcon(Castle, t("match_history.deep_dive.objectives.objective"))}
                        </th>
                        <th class="py-1 pr-3 font-normal">
                            {@render columnIcon(Flag, t("match_history.deep_dive.objectives.owner"))}
                        </th>
                        <th class="py-1 pr-3 font-normal">
                            {@render columnIcon(Timer, t("match_history.deep_dive.objectives.destroyed"))}
                        </th>
                        <th class="py-1 pr-3 text-right font-normal">
                            {@render columnIcon(Swords, t("match_history.deep_dive.objectives.players"))}
                        </th>
                        <th class="py-1 pr-3 text-right font-normal">
                            {@render columnIcon(Users, t("match_history.deep_dive.objectives.creeps"))}
                        </th>
                        <th class="py-1 text-right font-normal">
                            {@render columnIcon(Sparkles, t("match_history.deep_dive.objectives.spirit"))}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {#each rows as o, i (i)}
                        {@const KindIcon = KIND_ICONS[o.kind]}
                        <tr class="border-t border-border tabular-nums" class:opacity-60={o.destroyedS === undefined}>
                            <td class="py-1.5 pr-3">
                                <span class="inline-flex flex-wrap items-center gap-2">
                                    <KindIcon size={18} class="shrink-0" aria-hidden="true" />
                                    <span class="font-medium">{kindName(o.kind, o.index)}</span>
                                    <LaneChip lane={o.lane} ordinal={o.ordinal} />
                                </span>
                            </td>
                            <td class="py-1.5 pr-3">
                                <span class="inline-flex items-center gap-2">
                                    <TeamMark team={o.team} size={12} />
                                    {teamName(o.team)}
                                </span>
                            </td>
                            <td class="py-1.5 pr-3">
                                {#if o.destroyedS === undefined}
                                    <span class="inline-flex items-center gap-1 text-muted-foreground">
                                        <Shield size={14} aria-hidden="true" />
                                        {t("match_history.deep_dive.objectives.standing")}
                                    </span>
                                {:else}
                                    {clock(o.destroyedS)}
                                {/if}
                            </td>
                            <td class="py-1.5 pr-3 text-right">{num(o.playerDamage)}</td>
                            <td class="py-1.5 pr-3 text-right">{num(o.creepDamage)}</td>
                            <td class="py-1.5 text-right">{num(o.spiritDamage)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
    {#if bosses.length > 0}
        <ul class="mt-4 flex flex-col gap-1.5 text-sm">
            {#each bosses as b, i (i)}
                <li class="flex flex-wrap items-center gap-3 tabular-nums">
                    <span class="inline-flex items-center gap-2">
                        <Skull size={18} class="shrink-0" aria-hidden="true" />
                        <span class="font-medium">{t("match_history.deep_dive.objectives.mid_boss")}</span>
                        {clock(b.destroyedS)}
                    </span>
                    {#if b.killedBy}
                        <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Swords size={14} aria-hidden="true" />
                            <TeamMark team={b.killedBy} size={12} />
                            {t("match_history.deep_dive.objectives.killed_by", { team: teamName(b.killedBy) })}
                        </span>
                    {/if}
                    {#if b.claimedBy}
                        <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Crown size={14} aria-hidden="true" />
                            <TeamMark team={b.claimedBy} size={12} />
                            {t("match_history.deep_dive.objectives.claimed_by", { team: teamName(b.claimedBy) })}
                        </span>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</SectionCard>
