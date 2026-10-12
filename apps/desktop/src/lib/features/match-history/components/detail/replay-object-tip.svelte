<script lang="ts">
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import type { MatchTeam } from "../../detail";
    import type { DamageSplit, MapObjectInfo } from "../../map-object-info";
    import LaneChip from "./deep-dive/lane-chip.svelte";

    let { title, info }: { title: string; info: MapObjectInfo } = $props();

    const clock = (s: number) => formatClock(Math.round(s)) ?? "";
    const teamName = (team: MatchTeam) =>
        team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");
    const share = (v: number) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });

    const SOURCES = [
        { id: "gun", key: "match_history.detail.replay.damage_gun", colour: "#E0A050" },
        { id: "spirit", key: "match_history.detail.replay.damage_spirit", colour: "#B48CE6" },
        { id: "trooper", key: "match_history.detail.replay.damage_trooper", colour: "var(--color-muted-foreground)" },
    ] as const satisfies readonly { id: keyof DamageSplit["shares"]; key: string; colour: string }[];
</script>

<div class="flex items-center gap-2">
    <span class="font-medium">{title}</span>
    {#if info.type === "objective"}
        <LaneChip lane={info.lane} />
    {/if}
</div>
{#if info.type === "objective"}
    <div class="text-muted-foreground">{teamName(info.team)}</div>
    {#if info.kind !== "shrine"}
        <div class="text-muted-foreground tabular-nums">
            {info.destroyedS === undefined
                ? t("match_history.deep_dive.objectives.standing")
                : t("match_history.detail.replay.object_destroyed_at", { time: clock(info.destroyedS) })}
        </div>
    {/if}
    {#if info.damage}
        {@const damage = info.damage}
        <div class="mt-1.5 text-muted-foreground">{t("match_history.detail.replay.object_damage")}</div>
        <div class="mt-1 flex h-1 w-full min-w-40 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {#each SOURCES as s (s.id)}
                <span style:width="{damage.shares[s.id] * 100}%" style:background={s.colour}></span>
            {/each}
        </div>
        <div class="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 tabular-nums">
            {#each SOURCES as s (s.id)}
                <span class="inline-flex items-center gap-1.5">
                    <i class="inline-block size-2 rounded-full" style:background={s.colour} aria-hidden="true"></i>
                    {t(s.key)}
                </span>
                <span class="text-right">{formatNumber(Math.round(damage[s.id]))}</span>
                <span class="text-right text-muted-foreground">{share(damage.shares[s.id])}</span>
            {/each}
        </div>
    {/if}
{:else if info.type === "camp"}
    <div class="text-muted-foreground">{t("match_history.detail.replay.camps_hint")}</div>
{:else}
    {#if info.lastKill}
        {@const kill = info.lastKill}
        <div class="text-muted-foreground tabular-nums">
            {t("match_history.detail.replay.mid_boss_last_kill", { time: clock(kill.destroyedS) })}
        </div>
        {#if kill.killedBy}
            <div class="text-muted-foreground">
                {t("match_history.deep_dive.objectives.killed_by", { team: teamName(kill.killedBy) })}
            </div>
        {/if}
        {#if kill.claimedBy}
            <div class="text-muted-foreground">
                {t("match_history.deep_dive.objectives.claimed_by", { team: teamName(kill.claimedBy) })}
            </div>
        {/if}
    {/if}
    <div class={["text-muted-foreground", info.lastKill && "mt-1.5"]}>
        {t("match_history.detail.replay.mid_boss_hint")}
    </div>
{/if}
