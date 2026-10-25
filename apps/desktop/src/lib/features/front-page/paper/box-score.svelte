<script lang="ts">
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { BoxTeam } from "./types";

    let { teams, label = t("front_page.kit.box_score") }: { teams: BoxTeam[]; label?: string } = $props();

    const id = $props.id();
    const netWorth = (n: number) => formatNumber(n, { notation: "compact", maximumFractionDigits: 1 });
</script>

<!-- A grid with table roles, not a <table>: html-to-image grows every table row in the exported image. -->
<section class="box-score" aria-label={label}>
    {#each teams as team (team.team)}
        <div class="team {team.team}" role="table" aria-labelledby="{id}-{team.team}">
            <p class="caption" id="{id}-{team.team}">
                {team.name}{#if team.result}{" · "}{team.result}{/if}
            </p>
            <div class="sr-only" role="row">
                <span role="columnheader">{t("front_page.kit.hero")}</span>
                <span role="columnheader">{t("front_page.kit.kda")}</span>
                <span role="columnheader">{t("front_page.kit.net_worth")}</span>
                <span role="columnheader">{t("front_page.kit.grade")}</span>
            </div>
            {#each team.rows as row (row.id)}
                <div class="row" class:own={row.own} role="row" aria-current={row.own ? "true" : undefined}>
                    <span class="hero" role="cell">
                        {row.hero}{#if row.player}<span class="player">{row.player}</span>{/if}
                    </span>
                    <span role="cell">{row.kills}/{row.deaths}/{row.assists}</span>
                    <span class="nw" role="cell">{netWorth(row.netWorth)}</span>
                    <span class="grade" role="cell">{row.grade ?? ""}</span>
                </div>
            {/each}
        </div>
    {/each}
</section>

<style>
    .box-score {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 18px;
        padding: 6px 0 8px;
        border-top: 3px solid var(--fp-ink);
    }

    .team {
        min-width: 0;
        font-family: "Retail Demo", sans-serif;
        font-size: 12.5px;
        line-height: 1.3;
        font-variant-numeric: tabular-nums;
    }

    .team.hidden-king {
        --team: var(--fp-hk-ink);
    }

    .team.archmother {
        --team: var(--fp-am-ink);
    }

    .caption {
        margin: 0;
        padding-bottom: 2px;
        border-bottom: 2px solid var(--team);
        color: var(--team);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 14px;
        line-height: 1.3;
        text-transform: uppercase;
    }

    .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 64px 52px 30px;
        padding: 1px 0;
        border-bottom: 1px dotted color-mix(in oklch, var(--fp-ink) 40%, transparent);
        text-align: right;
        white-space: nowrap;
    }

    .hero {
        overflow: hidden;
        text-align: left;
        text-overflow: ellipsis;
    }

    .player {
        margin-left: 6px;
        color: var(--fp-ink-soft);
        font-size: 11px;
    }

    .nw {
        color: var(--fp-ink-soft);
    }

    .grade {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
    }

    .row.own {
        background: var(--fp-highlight);
        font-weight: 700;
    }
</style>
