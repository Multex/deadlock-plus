<script lang="ts">
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { TeamTotal } from "./types";

    let { teams, label = t("front_page.kit.kills") }: { teams: TeamTotal[]; label?: string } = $props();
</script>

<div class="team-score">
    <div class="totals">
        {#each teams as team, i (team.team)}
            {#if i > 0}<span class="dash" aria-hidden="true">–</span>{/if}
            <div class="team {team.team}">
                <b>{formatNumber(team.kills)}</b>
                <span>{team.name}</span>
            </div>
        {/each}
    </div>
    <p class="label">{label}</p>
</div>

<style>
    .totals {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        padding-top: 8px;
        border-top: 3px solid var(--fp-ink);
    }

    .team {
        display: flex;
        flex-direction: column;
    }

    .team b {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 52px;
        line-height: 0.9;
        font-variant-numeric: tabular-nums;
    }

    .team span {
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 13px;
    }

    .hidden-king {
        color: var(--fp-hk-ink);
    }

    .archmother {
        color: var(--fp-am-ink);
    }

    .dash {
        align-self: flex-start;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 40px;
        line-height: 1.3;
    }

    .label {
        margin: 0;
        color: var(--fp-ink-soft);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }
</style>
