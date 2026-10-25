<script lang="ts">
    import type { MatchTeam } from "@deadlock-plus/match/detail";
    import { t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import { placeMarks } from "./objectives";
    import type { ObjectiveMark } from "./types";

    let {
        marks,
        durationS,
        teamNames,
        title = t("front_page.kit.objectives"),
        keyed = false,
        gap = 0.055,
    }: {
        marks: ObjectiveMark[];
        durationS: number;
        teamNames: Record<MatchTeam, string>;
        title?: string;
        /** Lists what each short label stands for. */
        keyed?: boolean;
        /** Share of the strip one mark needs before the next one stacks. */
        gap?: number;
    } = $props();

    const TICK_S = 300;
    const MARK_PX = 22;

    let trackW = $state(0);
    const width = $derived(trackW > 0 ? MARK_PX / trackW : gap);

    const clock = (s: number) => formatClock(Math.max(0, Math.round(s))) ?? "";
    const up = $derived(
        placeMarks(
            marks.filter((m) => m.team === "hidden-king"),
            durationS,
            gap,
            width,
        ),
    );
    const down = $derived(
        placeMarks(
            marks.filter((m) => m.team === "archmother"),
            durationS,
            gap,
            width,
        ),
    );
    const rows = $derived(Math.max(1, ...up.map((m) => m.row + 1), ...down.map((m) => m.row + 1)));
    const ticks = $derived(
        Array.from({ length: Math.floor(durationS / TICK_S) + 1 }, (_, i) => i * TICK_S).filter(
            (tick) => durationS - tick >= TICK_S / 2,
        ),
    );
    const kinds = $derived([...new Map(marks.map((m) => [m.short, m.label])).entries()]);
</script>

<section class="objectives" class:keyed style="--mark: {MARK_PX}px;">
    <div class="legend">
        <h4>{title}</h4>
        <p><i class="hidden-king"></i>{teamNames["hidden-king"]}</p>
        <p><i class="archmother"></i>{teamNames.archmother}</p>
    </div>
    <div class="track" style="--rows: {rows};" bind:clientWidth={trackW}>
        <div class="side up">
            {#each up as m (m.id)}
                <span
                    class="mark hidden-king"
                    style="left: {m.at}%; bottom: calc({m.row} * var(--row));"
                    title="{m.label} {clock(m.timeS)}">{m.short}</span
                >
            {/each}
        </div>
        <div class="axis">
            {#each ticks as tick (tick)}
                <span style="left: {durationS > 0 ? (tick / durationS) * 100 : 0}%;">{clock(tick)}</span>
            {/each}
            <span class="end" style="left: 100%;">{clock(durationS)}</span>
        </div>
        <div class="side down">
            {#each down as m (m.id)}
                <span
                    class="mark archmother"
                    style="left: {m.at}%; top: calc({m.row} * var(--row));"
                    title="{m.label} {clock(m.timeS)}">{m.short}</span
                >
            {/each}
        </div>
    </div>
    {#if keyed}
        <ul class="key">
            {#each kinds as [short, label] (short)}
                <li><b>{short}</b> {label}</li>
            {/each}
        </ul>
    {/if}
</section>

<style>
    .objectives {
        --row: 15px;
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 14px;
        align-items: center;
        margin-top: auto;
        padding-top: 6px;
        border-top: 3px double var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-size: 10.5px;
    }

    .objectives.keyed {
        grid-template-columns: 128px 1fr 190px;
    }

    h4 {
        margin: 0 0 3px;
        color: var(--fp-ink);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .legend p {
        display: flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        white-space: nowrap;
    }

    i {
        flex: none;
        width: 9px;
        height: 9px;
    }

    i.hidden-king,
    .mark.hidden-king {
        background: var(--fp-hk-ink);
    }

    i.archmother,
    .mark.archmother {
        background: var(--fp-am-ink);
    }

    .track {
        position: relative;
        display: grid;
        grid-template-rows: calc(var(--rows) * var(--row)) 16px calc(var(--rows) * var(--row));
    }

    .side {
        position: relative;
    }

    .mark {
        position: absolute;
        display: grid;
        place-items: center;
        width: var(--mark);
        height: calc(var(--row) - 2px);
        transform: translateX(-50%);
        color: var(--fp-paper);
        font-weight: 700;
        font-size: 9px;
        letter-spacing: 0.02em;
    }

    .axis {
        position: relative;
        border-top: 1px solid var(--fp-ink);
        border-bottom: 1px solid var(--fp-ink);
    }

    .axis span {
        position: absolute;
        top: 1px;
        transform: translateX(-50%);
        color: var(--fp-ink-soft);
        font-size: 9.5px;
        font-variant-numeric: tabular-nums;
    }

    .axis span::before {
        content: "";
        position: absolute;
        left: 50%;
        top: -4px;
        height: 3px;
        border-left: 1px solid var(--fp-ink);
    }

    .axis span:first-child {
        transform: none;
    }

    .axis span.end {
        transform: translateX(-100%);
        color: var(--fp-ink);
        font-weight: 700;
    }

    .key {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 8px;
        margin: 0;
        padding: 0;
        list-style: none;
        color: var(--fp-ink-soft);
        font-size: 9.5px;
        line-height: 1.25;
    }

    .key b {
        display: inline-block;
        min-width: 16px;
        color: var(--fp-ink);
    }
</style>
