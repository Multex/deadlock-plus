<script lang="ts">
    import {
        ChartNoAxesColumn,
        Coins,
        Crosshair,
        Flag,
        Handshake,
        HeartPulse,
        Percent,
        Replace,
        Shield,
        Skull,
        TrendingUp,
        User,
        Zap,
    } from "@lucide/svelte";
    import type { Component } from "svelte";
    import { toast } from "svelte-sonner";

    import { openWithDeeplink } from "$lib/core/deeplink";
    import { errorText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { openUrl } from "$lib/core/opener";
    import { statlockerProfileUrl } from "$lib/features/voice-bans/voice-ban";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
    import type { LiveTeam } from "@deadlock-plus/ipc-types/LiveTeam";
    import {
        formatCompact,
        formatPercent,
        killParticipation,
        soulsLead,
        soulsPerMinute,
        steamProfileUrl,
        teamTotals,
        type HeroSwap,
    } from "../live";
    import HeroIcon from "./hero-icon.svelte";
    import RankBadge from "./rank-badge.svelte";

    let {
        team,
        totalSouls,
        clockSecs,
        pregame,
        heroes,
        tiers,
        swapped,
    }: {
        team: LiveTeam;
        totalSouls: number;
        clockSecs: number | null;
        pregame: boolean;
        heroes: Record<number, Hero>;
        tiers: RankTier[];
        swapped: Map<number, HeroSwap>;
    } = $props();

    const totals = $derived(teamTotals(team.players));
    const perMinute = (souls: number | null) => {
        const v = soulsPerMinute(souls, clockSecs);
        return v === null ? null : String(Math.round(v / 10) * 10);
    };
    const whole = (v: number | null) => (v === null ? null : String(v));
    const cell = (v: string | null) => (pregame || v === null ? "–" : v);
    const faint = (v: string | null) => pregame || v === null || v === "0";
    const lead = $derived(pregame ? null : soulsLead(team.souls, totalSouls));
    const open = (run: () => Promise<void>) =>
        run().catch((e) => toast.error(t("live.player.open_failed", { error: errorText(e) })));
    const swapTitle = (s: HeroSwap) =>
        t("live.swaps.line", { from: heroes[s.from]?.name ?? "?", to: heroes[s.to]?.name ?? "?" });
    const heroName = (p: LivePlayer) => (p.heroId === null ? undefined : heroes[p.heroId]?.name);
</script>

{#snippet head(Icon: Component, label: string, cls: string)}
    <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <span {...props} class="hc {cls}" role="columnheader" aria-label={label}>
                    <Icon size={16} />
                </span>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
{/snippet}

{#snippet headPart(Icon: Component, label: string, cls: string)}
    <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <span {...props} class="hp {cls}" aria-label={label}>
                    <Icon size={16} />
                </span>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
{/snippet}

{#snippet kda(k: string, d: string, a: string)}
    <span class="kda p" class:muted={pregame}>
        <b class="ck">{k}</b><i>&middot;</i><b class="cd">{d}</b><i>&middot;</i><b class="ca">{a}</b>
    </span>
{/snippet}

{#snippet action(Icon: Component, label: string, run: () => Promise<void>)}
    <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <button {...props} type="button" class="act" aria-label={label} onclick={() => open(run)}>
                    <Icon size={14} />
                </button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
{/snippet}

<Tooltip.Provider>
    <div class="team" data-side={team.side} role="table" aria-label={t(`live.team.${team.side}`)}>
        <div class="grid head" role="row">
            <span class="tn" role="columnheader">{t(`live.team.${team.side}`)}</span>
            {@render head(Shield, t("live.col.rank"), "")}
            {@render head(Coins, t("live.col.souls"), "g cs")}
            {@render head(TrendingUp, t("live.col.souls_per_min"), "lo cspm")}
            <span class="g" role="columnheader">
                <span class="kda">
                    {@render headPart(Crosshair, t("live.col.kills"), "ck")}
                    <i class="gap">&middot;</i>
                    {@render headPart(Skull, t("live.col.deaths"), "cd")}
                    <i class="gap">&middot;</i>
                    {@render headPart(Handshake, t("live.col.assists"), "ca")}
                </span>
            </span>
            {@render head(Percent, t("live.col.kill_participation"), "lo cr")}
            {@render head(Zap, t("live.col.hero_damage"), "g chd")}
            {@render head(Flag, t("live.col.objective_damage"), "cod")}
            {@render head(HeartPulse, t("live.col.healing"), "hl chl")}
        </div>

        {#each team.players as p (p.key)}
            {@const souls = formatCompact(p.souls)}
            {@const spm = perMinute(p.souls)}
            {@const kp = formatPercent(killParticipation(p.kills, p.assists, totals.kills))}
            {@const heroDmg = formatCompact(p.heroDamage)}
            {@const objDmg = formatCompact(p.objectiveDamage)}
            {@const heal = formatCompact(p.healing)}
            <div class="grid row" class:me={p.isYou} role="row">
                <span class="id" role="cell">
                    <HeroIcon heroId={p.heroId} {heroes} />
                    {#if swapped.has(p.key)}
                        <span class="sw" title={swapTitle(swapped.get(p.key)!)}
                            ><Replace size={9} aria-hidden="true" /></span
                        >
                    {/if}
                </span>
                <span class="nm" role="cell" title={p.name ?? heroName(p)}>{p.name ?? heroName(p) ?? "–"}</span>
                <span class="rk" role="cell">
                    {#if p.steamId}
                        {@const id = p.steamId}
                        <span class="acts">
                            {@render action(User, t("live.player.steam_profile"), () =>
                                openWithDeeplink(steamProfileUrl(id)),
                            )}
                            {@render action(ChartNoAxesColumn, t("live.player.statlocker"), () =>
                                openUrl(statlockerProfileUrl(id)),
                            )}
                        </span>
                    {/if}
                    <RankBadge rank={p.rank} {tiers} />
                </span>
                <span class="g r p cs" class:z={faint(souls)} role="cell">{cell(souls)}</span>
                <span class="r s lo cspm" class:z={faint(spm)} role="cell">{cell(spm)}</span>
                <span class="g" role="cell">
                    {@render kda(cell(whole(p.kills)), cell(whole(p.deaths)), cell(whole(p.assists)))}
                </span>
                <span class="r s lo cr" class:z={faint(kp)} role="cell">{cell(kp)}</span>
                <span class="g r s chd" class:z={faint(heroDmg)} role="cell">{cell(heroDmg)}</span>
                <span class="r s cod" class:z={faint(objDmg)} role="cell">{cell(objDmg)}</span>
                <span class="r s hl chl" class:z={faint(heal)} role="cell">{cell(heal)}</span>
            </div>
        {/each}

        {#if !pregame}
            <div class="grid tot" role="row">
                <span class="tl" role="cell">{lead ?? ""}</span>
                <span></span>
                <span class="g r p cs" role="cell">{cell(formatCompact(team.souls))}</span>
                <span class="r s lo cspm" role="cell">{cell(perMinute(totals.souls))}</span>
                <span class="g" role="cell">
                    {@render kda(cell(whole(totals.kills)), cell(whole(totals.deaths)), cell(whole(totals.assists)))}
                </span>
                <span class="lo"></span>
                <span class="g r s chd" role="cell">{cell(formatCompact(totals.heroDamage))}</span>
                <span class="r s cod" role="cell">{cell(formatCompact(totals.objectiveDamage))}</span>
                <span class="r s hl chl" role="cell">{cell(formatCompact(totals.healing))}</span>
            </div>
        {/if}
    </div>
</Tooltip.Provider>

<style>
    .team {
        --tc: oklch(0.8 0.125 82);
        --c-souls: oklch(0.86 0.14 98);
        --c-spm: oklch(0.76 0.08 98);
        --c-k: oklch(0.82 0.12 195);
        --c-d: oklch(0.68 0.19 25);
        --c-a: oklch(0.8 0.12 340);
        --c-r: oklch(0.8 0.05 240);
        --c-hd: oklch(0.76 0.15 55);
        --c-od: oklch(0.74 0.12 270);
        --c-hl: oklch(0.78 0.16 150);
        container-type: inline-size;
        border: 1px solid var(--border);
        border-top: 2px solid var(--tc);
        background: var(--card);
        border-radius: calc(var(--radius) + 2px);
        overflow: clip;
    }
    .team[data-side="sapphire"] {
        --tc: oklch(0.72 0.11 245);
    }
    :global(:root[data-theme="daylight"]) .team {
        --tc: oklch(0.6 0.12 70);
    }
    :global(:root[data-theme="daylight"]) .team[data-side="sapphire"] {
        --tc: oklch(0.5 0.12 245);
    }
    .tn {
        grid-column: 1 / 3;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--tc);
    }
    .grid {
        --cols: 26px minmax(6rem, 1fr) 28px 3.9rem 3rem 8.5rem 2.9rem 3.7rem 3.7rem 3.5rem;
        position: relative;
        display: grid;
        grid-template-columns: var(--cols);
        column-gap: 12px;
        align-items: center;
        min-height: 38px;
        padding: 0 14px;
        font-size: 14px;
    }
    .grid > * {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .grid > .id,
    .grid > .rk {
        overflow: visible;
    }
    .g {
        display: flex;
        align-self: stretch;
        align-items: center;
        justify-content: center;
        margin-left: -1px;
        padding-left: 12px;
        border-left: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
    }
    .r {
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
    .p {
        font-size: 15px;
    }
    .s {
        font-size: 13px;
    }
    .z {
        color: var(--muted-foreground) !important;
        opacity: 0.5;
    }
    .head {
        position: sticky;
        top: 0;
        z-index: 2;
        min-height: 40px;
        color: var(--muted-foreground);
        background: var(--card);
        border-bottom: 1px solid var(--border);
    }
    .id {
        position: relative;
    }
    .sw {
        position: absolute;
        right: -3px;
        bottom: -3px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        color: var(--tc);
        background: var(--card);
        border: 1px solid var(--tc);
    }
    .rk {
        position: relative;
        display: flex;
        justify-content: center;
    }
    .acts {
        position: absolute;
        top: 50%;
        right: 100%;
        z-index: 1;
        display: flex;
        gap: 2px;
        margin-right: 8px;
        padding: 2px;
        transform: translateY(-50%);
        border-radius: var(--radius);
        background: var(--card);
        opacity: 0;
        pointer-events: none;
    }
    .row:hover .acts,
    .row:focus-within .acts {
        opacity: 1;
        pointer-events: auto;
    }
    .act {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: calc(var(--radius) - 2px);
        color: var(--muted-foreground);
    }
    .act:hover,
    .act:focus-visible {
        color: var(--foreground);
        background: color-mix(in oklch, var(--foreground) 12%, transparent);
    }
    .hc,
    .hp {
        display: flex;
        justify-content: center;
    }
    .row {
        border-top: 1px solid color-mix(in oklch, var(--border) 40%, transparent);
    }
    .row:nth-child(even) {
        background: color-mix(in oklch, var(--foreground) 4%, transparent);
    }
    .row:hover {
        background: color-mix(in oklch, var(--foreground) 9%, transparent);
    }
    .row.me::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 3px;
        background: var(--tc);
    }
    .row.me .nm {
        font-weight: 700;
    }
    .tot {
        min-height: 36px;
        font-weight: 700;
        background: color-mix(in oklch, var(--foreground) 3%, transparent);
        border-top: 1px solid var(--border);
    }
    .kda {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-variant-numeric: tabular-nums;
    }
    .kda > b,
    .kda > :global(.hp) {
        flex: none;
        min-width: 3ch;
        text-align: center;
        font-weight: inherit;
    }
    .kda > i {
        flex: none;
        font-style: normal;
        color: var(--muted-foreground);
        opacity: 0.7;
    }
    .kda > i.gap {
        visibility: hidden;
    }
    .tl {
        grid-column: 1 / 3;
        overflow: visible !important;
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--tc);
    }
    .kda.muted b {
        color: var(--muted-foreground);
        opacity: 0.5;
    }
    .ck {
        color: var(--c-k);
    }
    .cd {
        color: var(--c-d);
    }
    .ca {
        color: var(--c-a);
    }
    .cs {
        color: var(--c-souls);
    }
    .cspm {
        color: var(--c-spm);
    }
    .cr {
        color: var(--c-r);
    }
    .chd {
        color: var(--c-hd);
    }
    .cod {
        color: var(--c-od);
    }
    .chl {
        color: var(--c-hl);
    }

    @container (max-width: 820px) {
        .grid {
            --cols: 26px minmax(5rem, 1fr) 28px 3.9rem 8.5rem 3.7rem 3.7rem 3.5rem;
        }
        .lo {
            display: none !important;
        }
    }
    @container (max-width: 650px) {
        .grid {
            --cols: 26px minmax(4.5rem, 1fr) 28px 3.6rem 8.2rem 3.4rem 3.4rem;
            column-gap: 10px;
        }
        .g {
            padding-left: 10px;
        }
        .hl {
            display: none !important;
        }
    }
</style>
