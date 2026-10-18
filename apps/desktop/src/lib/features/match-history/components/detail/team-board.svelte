<script lang="ts">
    import {
        ArrowDown,
        ArrowUp,
        Award,
        Coins,
        DoorOpen,
        Crosshair,
        Handshake,
        HeartPulse,
        Minus,
        Package,
        ScanSearch,
        Skull,
        Zap,
    } from "@lucide/svelte";
    import type { Component, Snippet } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import HeroIcon from "$lib/features/live/components/hero-icon.svelte";
    import RankBadge from "$lib/features/live/components/rank-badge.svelte";
    import { formatCompact, rankView } from "$lib/features/live/live";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import type { IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
    import { higherIsBetter, type Versus, type VersusKey, type VersusStat } from "@deadlock-plus/match/versus";
    import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { gradeBySlot } from "../../mvp";
    import GradeChip from "./grade-chip.svelte";
    import ItemTile from "./item-tile.svelte";
    import {
        BOARD_COLUMN_MIN_REM,
        BOARD_LABEL_REM,
        anyRanked,
        BOARD_ROWS,
        columnName,
        gridSlots,
        ITEM_GAP_PX,
        ITEM_GRID_COLUMNS,
        ITEM_TILE_PX,
        itemGridSize,
        itemSlots,
        rankArtVars,
        STAT_ROWS,
        type BoardColumn,
        type BoardRowKey,
        type BoardTeam,
        type StatKey,
    } from "@deadlock-plus/match/scoreboard";

    let {
        boards,
        heroes,
        tiers,
        visuals,
        bans,
        averageBadge,
        versus = null,
        grade = null,
    }: {
        boards: BoardTeam[];
        heroes: Record<number, Hero>;
        tiers: RankTier[];
        visuals: ReadonlyMap<number, IdVisual>;
        bans: number[];
        averageBadge: number | null;
        versus?: Versus | null;
        grade?: MvpMatchGrade | null;
    } = $props();

    const grades = $derived(gradeBySlot(grade));

    const compact = (n: number) => formatCompact(n) ?? "0";
    const teamName = (b: BoardTeam) =>
        b.team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");

    const rowIcon: Record<BoardRowKey, Component> = {
        items: Package,
        souls: Coins,
        kills: Crosshair,
        deaths: Skull,
        assists: Handshake,
        playerDamage: Zap,
        healing: HeartPulse,
    };
    const versusStat = (c: BoardColumn, key: StatKey): { key: VersusKey; stat: VersusStat } | null => {
        if (!c.own || !versus || !(key in versus.stats)) return null;
        const k = key as VersusKey;
        const stat = versus.stats[k];
        return stat ? { key: k, stat } : null;
    };
    const markLabel = (m: VersusStat["mark"]) =>
        m === "above"
            ? t("match_history.detail.versus.above")
            : m === "below"
              ? t("match_history.detail.versus.below")
              : t("match_history.detail.versus.equal");
    const averageText = (k: VersusKey, v: number) =>
        k === "souls"
            ? t("match_history.detail.versus.souls_rate", { value: compact(Math.round(v)) })
            : t("match_history.detail.versus.average", { value: (Math.round(v * 10) / 10).toString() });
    const compactRow = new Map(STAT_ROWS.map((r) => [r.key, r.compact]));

    const playerName = (c: BoardColumn) =>
        columnName(c.player.name ?? null, t("match_history.detail.player_fallback", { slot: c.player.slot }));

    const showRanks = $derived(anyRanked(boards));
    const columnCount = $derived(Math.max(boards[0].columns.length + boards[1].columns.length, 1));
    const gridSize = $derived(
        itemGridSize(boards.flatMap((b) => b.columns.map((c) => itemSlots(c.player.items, visuals).length))),
    );
</script>

{#snippet label(Icon: Component, text: string)}
    <th scope="row" class="label" title={text}>
        <Icon size={16} aria-hidden="true" />
        <span class="label-text">{text}</span>
    </th>
{/snippet}

{#snippet side(b: BoardTeam, cell: Snippet<[BoardColumn]>)}
    {#each b.columns as c, i (c.player.slot)}
        <td
            class="cell"
            class:me={c.own}
            class:odd={i % 2 === 1}
            class:first={b === boards[0] && i === 0}
            class:last={b === boards[1] && i === b.columns.length - 1}
            data-team={b.team}
        >
            {@render cell(c)}
        </td>
    {:else}
        <td class="cell"></td>
    {/each}
{/snippet}

{#snippet band(Icon: Component, text: string, cell: Snippet<[BoardColumn]>)}
    <tr>
        {@render side(boards[0], cell)}
        {@render label(Icon, text)}
        {@render side(boards[1], cell)}
    </tr>
{/snippet}

{#snippet itemsCell(c: BoardColumn)}
    {@const slots = gridSlots(itemSlots(c.player.items, visuals), gridSize)}
    <ul class="items" aria-label={t("match_history.detail.col.items")}>
        {#each slots as slot, i (slot?.itemId ?? `empty-${i}`)}
            <ItemTile {slot} />
        {/each}
    </ul>
{/snippet}

{#snippet statCell(c: BoardColumn, key: StatKey, isCompact: boolean)}
    <span class="stat" class:best={c.best[key]}>
        {isCompact ? compact(c.player[key]) : c.player[key]}
        {#if c.best[key]}<span class="sr-only">, {t("match_history.detail.board.best")}</span>{/if}
    </span>
    {@const v = versusStat(c, key)}
    {#if v}
        <span
            class="versus"
            data-export-ignore
            class:good={v.stat.mark !== "equal" && (v.stat.mark === "above") === higherIsBetter(v.key)}
            class:bad={v.stat.mark !== "equal" && (v.stat.mark === "above") !== higherIsBetter(v.key)}
            title={t("match_history.detail.versus.hint", { samples: versus?.samples ?? 0 })}
        >
            {#if v.stat.mark === "above"}
                <ArrowUp size={11} aria-hidden="true" />
            {:else if v.stat.mark === "below"}
                <ArrowDown size={11} aria-hidden="true" />
            {:else}
                <Minus size={11} aria-hidden="true" />
            {/if}
            <span class="sr-only">{markLabel(v.stat.mark)}</span>
            {averageText(v.key, v.stat.average)}
        </span>
    {/if}
{/snippet}

{#snippet header(c: BoardColumn, i: number)}
    <th scope="col" class="player" class:me={c.own} class:odd={i % 2 === 1} data-team={c.player.team}>
        <span class="who">
            {#if showRanks}
                <span class="badge-slot" style={rankArtVars(rankView(c.badge)?.tier)}>
                    {#if c.badge !== null}
                        <RankBadge rank={c.badge} {tiers} />
                    {:else}
                        <span class="sr-only">{t("match_history.detail.board.unranked")}</span>
                    {/if}
                </span>
            {/if}
            <span class="portrait" class:mvp={c.mvp === "mvp"} class:key={c.mvp === "key"}>
                <HeroIcon heroId={c.player.heroId} {heroes} size={52} />
                {#if c.mvp}
                    <span class="award" class:key={c.mvp === "key"}>
                        {c.mvp === "mvp" ? t("match_history.detail.mvp") : t("match_history.detail.key_player")}
                    </span>
                {/if}
                {#if c.own}<span class="you">{t("match_history.detail.you")}</span>{/if}
            </span>
            <span class="nm" title={playerName(c)}>{playerName(c)}</span>
        </span>
    </th>
{/snippet}

{#snippet gradeCell(c: BoardColumn, i: number)}
    {@const g = grades.get(c.player.slot)}
    <td class="grade" class:me={c.own} class:odd={i % 2 === 1} data-team={c.player.team}>
        {#if g}<GradeChip grade={g} />{/if}
    </td>
{/snippet}

{#snippet gradeFlag(Icon: Component, text: string)}
    <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <button {...props} type="button" class="flag" aria-label={text}>
                    <Icon size={12} aria-hidden="true" />
                </button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{text}</Tooltip.Content>
    </Tooltip.Root>
{/snippet}

{#snippet total(Icon: Component, text: string, value: string)}
    <span title={text}>
        <Icon size={13} aria-hidden="true" />
        <span class="total-label">{text}</span>
        <span class="total-value">{value}</span>
    </span>
{/snippet}

{#snippet teamHead(b: BoardTeam, edge: "left" | "right")}
    <th scope="colgroup" colspan={Math.max(b.columns.length, 1)} class="team" data-team={b.team} data-edge={edge}>
        <span class="team-line">
            <span class="team-name">{teamName(b)}</span>
            {#if b.result}
                <span class="result" class:win={b.result === "win"}>
                    {b.result === "win" ? t("stats.outcome.win") : t("stats.outcome.loss")}
                </span>
            {/if}
        </span>
        <span class="totals">
            {@render total(Crosshair, t("live.col.kills"), String(b.totals.kills))}
            {@render total(Coins, t("live.col.souls"), compact(b.totals.souls))}
            {@render total(Zap, t("match_history.detail.col.damage"), compact(b.totals.playerDamage))}
        </span>
    </th>
{/snippet}

<Tooltip.Provider>
    <div
        class="scroller"
        data-export-board
        style:--item-cols={ITEM_GRID_COLUMNS}
        style:--item-size="{ITEM_TILE_PX}px"
        style:--item-gap="{ITEM_GAP_PX}px"
        style:--bar-left="var(--team-{boards[0].team})"
        style:--bar-right="var(--team-{boards[1].team})"
    >
        <table
            aria-label={t("match_history.detail.board.label")}
            style:--cols={columnCount}
            style:--col-min="{BOARD_COLUMN_MIN_REM}rem"
            style:--mid="{BOARD_LABEL_REM}rem"
        >
            <colgroup>
                {#each boards[0].columns as c (c.player.slot)}<col />{/each}
                <col class="mid" />
                {#each boards[1].columns as c (c.player.slot)}<col />{/each}
            </colgroup>
            <thead>
                <tr>
                    {@render teamHead(boards[0], "left")}
                    <td class="corner top">
                        {#if bans.length > 0}
                            <div class="bans">
                                <span class="mid-label">{t("match_history.detail.bans")}</span>
                                <ul class="ban-list">
                                    {#each bans as id (id)}
                                        <li><HeroIcon heroId={id} {heroes} size={24} /></li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </td>
                    {@render teamHead(boards[1], "right")}
                </tr>
                <tr>
                    {#each boards[0].columns as c, i (c.player.slot)}{@render header(c, i)}{/each}
                    <th scope="col" class="corner">
                        {#if averageBadge !== null}
                            <span class="avg" style={rankArtVars(rankView(averageBadge)?.tier)}>
                                <RankBadge rank={averageBadge} {tiers} />
                                <span class="mid-label">{t("match_history.detail.avg_rank")}</span>
                            </span>
                        {:else}
                            <span class="sr-only">{t("match_history.detail.board.stat")}</span>
                        {/if}
                    </th>
                    {#each boards[1].columns as c, i (c.player.slot)}{@render header(c, i)}{/each}
                </tr>
                {#if grade && grades.size > 0}
                    <tr>
                        {#each boards[0].columns as c, i (c.player.slot)}{@render gradeCell(c, i)}{/each}
                        <th scope="row" class="label grade-label">
                            <Award size={16} aria-hidden="true" />
                            <span class="label-text">{t("match_history.detail.grade.label")}</span>
                            {#if grade.leaver || !grade.pathsChecked}
                                <span class="flags">
                                    {#if grade.leaver}
                                        {@render gradeFlag(DoorOpen, t("match_history.detail.grade.leaver"))}
                                    {/if}
                                    {#if !grade.pathsChecked}
                                        {@render gradeFlag(ScanSearch, t("match_history.detail.grade.unchecked"))}
                                    {/if}
                                </span>
                            {/if}
                        </th>
                        {#each boards[1].columns as c, i (c.player.slot)}{@render gradeCell(c, i)}{/each}
                    </tr>
                {/if}
            </thead>
            <tbody>
                {#each BOARD_ROWS as row (row.key)}
                    {@const text = t(row.labelKey)}
                    {#if row.key === "items"}
                        {@render band(rowIcon.items, text, itemsCell)}
                    {:else}
                        {@const key = row.key}
                        {@const isCompact = compactRow.get(key) ?? false}
                        <tr>
                            {#each [boards[0], boards[1]] as b, i (b.team)}
                                {#if i === 1}{@render label(rowIcon[key], text)}{/if}
                                {#each b.columns as c, ci (c.player.slot)}
                                    <td
                                        class="cell"
                                        class:me={c.own}
                                        class:odd={ci % 2 === 1}
                                        class:first={i === 0 && ci === 0}
                                        class:last={i === 1 && ci === b.columns.length - 1}
                                        data-team={b.team}
                                    >
                                        {@render statCell(c, key, isCompact)}
                                    </td>
                                {:else}
                                    <td class="cell"></td>
                                {/each}
                            {/each}
                        </tr>
                    {/if}
                {/each}
            </tbody>
        </table>
    </div>
</Tooltip.Provider>

<style>
    .scroller {
        --team-hidden-king: oklch(0.8 0.125 82);
        --team-archmother: oklch(0.72 0.11 245);
        overflow-x: auto;
        border: 1px solid var(--border);
        border-top-width: 0;
        border-radius: calc(var(--radius) + 2px);
        padding-top: 3px;
        background:
            linear-gradient(to right, var(--bar-left), transparent) top left / 50% 3px no-repeat,
            linear-gradient(to left, var(--bar-right), transparent) top right / 50% 3px no-repeat,
            var(--card);
        background-origin: border-box;
    }
    :global(:root[data-theme="daylight"]) .scroller {
        --team-hidden-king: oklch(0.6 0.12 70);
        --team-archmother: oklch(0.5 0.12 245);
    }
    table {
        width: 100%;
        min-width: calc(var(--cols) * var(--col-min) + var(--mid));
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 13px;
    }
    col.mid {
        width: var(--mid);
    }
    [data-team] {
        --tc: var(--team-hidden-king);
    }
    [data-team="archmother"] {
        --tc: var(--team-archmother);
    }
    th,
    td {
        padding: 6px 4px;
        vertical-align: middle;
        text-align: center;
        font-weight: normal;
    }
    .team {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(to right, color-mix(in oklch, var(--tc) 30%, transparent), transparent);
        text-align: left;
    }
    .team[data-edge="right"] {
        background: linear-gradient(to left, color-mix(in oklch, var(--tc) 30%, transparent), transparent);
        text-align: right;
    }
    .team[data-edge="right"] .team-line {
        flex-direction: row-reverse;
        justify-content: flex-start;
    }
    .team[data-edge="right"] .totals {
        justify-content: flex-end;
    }
    .team-line {
        display: flex;
        align-items: baseline;
        gap: 10px;
    }
    /* The exported image keeps each measured width but can draw the text a fraction wider, which would wrap the
       name over the totals below it. */
    .team-name {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
    }
    .result {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted-foreground);
    }
    .result.win {
        color: var(--foreground);
    }
    .totals {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 14px;
        margin-top: 3px;
        font-size: 12px;
        color: var(--muted-foreground);
        font-variant-numeric: tabular-nums;
    }
    .totals > :global(span) {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .player {
        padding: 12px 4px 10px;
        border-bottom: 1px solid var(--border);
    }
    .who {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
    .badge-slot {
        display: flex;
        --rank-badge-size: 36px;
        width: 36px;
        height: 36px;
        margin-bottom: 8px;
        align-items: center;
        justify-content: center;
    }
    .portrait {
        position: relative;
        display: flex;
        width: 52px;
        height: 52px;
        border-radius: 6px;
    }
    .portrait.mvp {
        box-shadow:
            0 0 0 2px var(--tc),
            0 0 12px color-mix(in oklch, var(--tc) 70%, transparent);
    }
    .portrait.key {
        box-shadow:
            0 0 0 1px var(--tc),
            0 0 8px color-mix(in oklch, var(--tc) 40%, transparent);
    }
    .award {
        position: absolute;
        top: -9px;
        left: 50%;
        translate: -50% 0;
        padding: 0 5px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 13px;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--foreground);
        background: color-mix(in oklch, var(--tc) 70%, var(--card));
        box-shadow: 0 0 0 1px var(--card);
    }
    .award.key {
        background: color-mix(in oklch, var(--tc) 35%, var(--card));
    }
    .nm {
        display: block;
        width: 100%;
        height: 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        line-height: 16px;
    }
    .you {
        position: absolute;
        bottom: -5px;
        left: 50%;
        translate: -50% 0;
        padding: 0 5px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 13px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--foreground);
        background: color-mix(in oklch, var(--tc) 55%, var(--card));
        box-shadow: 0 0 0 1px var(--card);
    }
    .corner {
        border-bottom: 1px solid var(--border);
        border-inline: 1px solid var(--border);
    }
    .bans,
    .avg {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }
    .avg {
        --rank-badge-size: 36px;
    }
    .mid-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted-foreground);
    }
    .ban-list {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 3px;
    }
    tbody tr {
        border-top: 1px solid color-mix(in oklch, var(--border) 50%, transparent);
    }
    .label {
        padding: 6px 4px;
        font-size: 11px;
        color: var(--muted-foreground);
        border-inline: 1px solid var(--border);
    }
    .grade {
        padding: 6px 2px 8px;
        border-bottom: 1px solid var(--border);
    }
    .grade-label {
        border-bottom: 1px solid var(--border);
    }
    .flags {
        display: flex;
        justify-content: center;
        gap: 2px;
        margin-top: 2px;
    }
    .flag {
        display: inline-flex;
        padding: 2px;
        border-radius: 4px;
        color: var(--warning);
        cursor: default;
    }
    .flag:hover,
    .flag:focus-visible {
        background: color-mix(in oklch, var(--accent) 60%, transparent);
        outline: none;
    }
    .flag:focus-visible {
        box-shadow: 0 0 0 2px var(--ring);
    }
    .label :global(svg) {
        display: block;
        margin: 0 auto 2px;
    }
    .label-text {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .total-label {
        color: var(--muted-foreground);
    }
    .total-value {
        color: var(--foreground);
    }
    .cell.odd,
    .grade.odd,
    .player.odd {
        background: color-mix(in oklch, var(--foreground) 5%, transparent);
    }
    .cell.me,
    .grade.me,
    .player.me {
        background: color-mix(in oklch, var(--tc) 12%, transparent);
    }
    .cell.first .items {
        --tip-left: 0%;
        --tip-shift: 0 0;
    }
    .cell.last .items {
        --tip-left: 100%;
        --tip-shift: -100% 0;
    }
    .items {
        display: grid;
        grid-template-columns: repeat(var(--item-cols), minmax(0, var(--item-size)));
        justify-content: center;
        gap: var(--item-gap);
        padding: 4px 2px;
    }
    .stat {
        display: inline-block;
        min-width: 3rem;
        padding: 0 6px;
        border-radius: 6px;
        line-height: 24px;
        font-variant-numeric: tabular-nums;
    }
    .versus {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        font-size: 10px;
        color: var(--muted-foreground);
        font-variant-numeric: tabular-nums;
    }
    .versus.good {
        color: var(--primary);
    }
    .versus.bad {
        color: var(--destructive);
    }
    .stat.best {
        font-weight: 700;
        background: color-mix(in oklch, var(--primary) 20%, transparent);
    }
</style>
