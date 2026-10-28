<script lang="ts">
    import { fitText } from "./fit-text";
    import Inner from "./inner.svelte";
    import type { Magazine } from "./magazine";

    let { mag }: { mag: Magazine } = $props();

    const R = 62;
    const C = 2 * Math.PI * R;
    const n = $derived(mag.numbers);
</script>

<Inner {mag} side="left" folio={2} section={mag.sections.numbers}>
    <div class="page">
        <span class="kicker">{mag.sections.numbers}</span>
        <h2 {@attach fitText(50, 32)}>{n.title}</h2>

        <div class="hero-row">
            <div class="big">
                <b>{n.matches}</b>
                <span {@attach fitText(17, 11)}>{n.matchesLabel}</span>
            </div>
            {#if n.won}
                <div class="donut">
                    <svg viewBox="0 0 150 150" aria-hidden="true">
                        <circle cx="75" cy="75" r={R} class="track" />
                        <circle
                            cx="75"
                            cy="75"
                            r={R}
                            class="fill"
                            stroke-dasharray="{C * n.won.share} {C}"
                            transform="rotate(-90 75 75)"
                        />
                    </svg>
                    <div class="donut-in">
                        <b>{n.won.text}</b>
                        <span>{n.won.label}</span>
                    </div>
                    <p class="record">{n.won.record}</p>
                </div>
            {/if}
        </div>

        <dl class="facts">
            {#each mag.facts as f (f.id)}
                <div>
                    <dt>{f.label}</dt>
                    <dd {@attach fitText(24, 14)}>{f.value}</dd>
                    <small {@attach fitText(12, 9)}>{f.note}</small>
                </div>
            {/each}
        </dl>

        {#if mag.calendar}
            {@const cal = mag.calendar}
            <div class="cal-head">
                <span class="kicker">{cal.title}</span>
                <span class="legend">
                    <i class="won"></i>{cal.legendWon}<i></i>{cal.legendLost}
                </span>
            </div>
            <div class="cal">
                {#each cal.weekdays as d, i (i)}
                    <span class="dow" aria-hidden="true">{d}</span>
                {/each}
                {#each Array(cal.lead) as _, i (i)}
                    <span></span>
                {/each}
                {#each cal.days as d, i (i)}
                    <div class="cell" aria-label={d.label} role="img">
                        <small aria-hidden="true">{d.day}</small>
                        {#if d.matches > 0}
                            <i class:won={d.won} style="--r: {d.size}px;" aria-hidden="true"><em>{d.matches}</em></i>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</Inner>

<style>
    .page {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 40px 84px 0 48px;
    }

    .kicker {
        color: var(--ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    h2 {
        flex: none;
        width: 300px;
        height: 100px;
        margin: 4px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 50px);
        line-height: 0.95;
        letter-spacing: -0.02em;
        text-wrap: balance;
    }

    .hero-row {
        display: flex;
        flex: none;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin-top: 4px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--page-text);
    }

    .big {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        min-width: 0;
    }

    .big b {
        color: var(--ink);
        font-family: "Valve Oracle", serif;
        font-weight: 100;
        font-size: 200px;
        line-height: 0.78;
        letter-spacing: -0.05em;
    }

    .big span {
        width: 140px;
        max-height: 40px;
        overflow: hidden;
        padding-bottom: 8px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 17px);
        line-height: 1.05;
        text-transform: uppercase;
        box-sizing: content-box;
    }

    .donut {
        position: relative;
        flex: none;
        width: 150px;
        text-align: center;
    }

    .donut svg {
        width: 150px;
        height: 150px;
    }

    .track {
        fill: none;
        stroke: #e2ddd2;
        stroke-width: 14;
    }

    .fill {
        fill: none;
        stroke: var(--ink);
        stroke-width: 14;
    }

    .donut-in {
        position: absolute;
        top: 0;
        left: 0;
        width: 150px;
        height: 150px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .donut-in b {
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 40px;
        line-height: 1;
    }

    .donut-in span,
    .record {
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }

    .record {
        margin: 4px 0 0;
        white-space: nowrap;
    }

    .facts {
        display: grid;
        flex: none;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin: 0;
        border-bottom: 1px solid var(--page-text);
    }

    .facts div {
        min-width: 0;
        padding: 10px 12px 10px 0;
        border-bottom: 1px solid #d8d2c6;
    }

    .facts div:nth-child(3n + 2),
    .facts div:nth-child(3n) {
        padding-left: 12px;
        border-left: 1px solid #d8d2c6;
    }

    .facts div:nth-last-child(-n + 3) {
        border-bottom: none;
    }

    dt {
        overflow: hidden;
        color: var(--ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    dd {
        height: 30px;
        margin: 2px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 24px);
        line-height: 30px;
        white-space: nowrap;
    }

    .facts small {
        display: block;
        height: 16px;
        overflow: hidden;
        color: var(--page-muted);
        font-size: var(--fs, 12px);
        line-height: 16px;
        white-space: nowrap;
    }

    .cal-head {
        display: flex;
        flex: none;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-top: 14px;
    }

    .legend {
        display: flex;
        align-items: center;
        gap: 5px;
        color: var(--page-muted);
        font-size: 11px;
        white-space: nowrap;
    }

    .legend i {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-left: 6px;
        border: 2px solid var(--ink);
        border-radius: 50%;
    }

    .legend i.won {
        background: var(--ink);
    }

    .cal {
        display: grid;
        flex: 1;
        min-height: 0;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        grid-template-rows: auto;
        grid-auto-rows: minmax(0, 1fr);
        margin-top: 6px;
        padding-bottom: 6px;
    }

    .dow {
        align-self: end;
        color: var(--page-muted);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 11px;
    }

    .cell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
        border-top: 1px solid #e2ddd2;
    }

    .cell small {
        position: absolute;
        top: 3px;
        left: 2px;
        color: var(--page-muted);
        font-size: 10px;
        line-height: 1;
    }

    .cell i {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--r);
        height: var(--r);
        border: 2px solid var(--ink);
        border-radius: 50%;
        color: var(--ink);
    }

    .cell i.won {
        color: var(--page-paper);
        background: var(--ink);
    }

    .cell em {
        font-style: normal;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        line-height: 1;
    }
</style>
