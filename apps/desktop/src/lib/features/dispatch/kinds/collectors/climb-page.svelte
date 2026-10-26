<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Page from "./page.svelte";
    import { shrink } from "./shrink";
    import type { CollectorsView } from "./view";

    let { v, alone = false }: { v: CollectorsView; alone?: boolean } = $props();

    const id = $props.id();
    const c = $derived(v.chart);
</script>

<Page
    side="left"
    {alone}
    label={t("dispatch.collectors.climb_title")}
    folio={t("dispatch.collectors.folio", { season: v.season, page: 2 })}
>
    <div class="kicker">{v.season} · {v.dates}</div>
    <h2 class="foil" {@attach shrink(92, 52, t("dispatch.collectors.climb_title"))}>
        {t("dispatch.collectors.climb_title")}
    </h2>
    <p class="deck">{t("dispatch.collectors.climb_deck")}</p>

    {#if c && v.callout}
        <svg class="chart" viewBox="0 0 {c.width} {c.height}" width={c.width} height={c.height} role="img">
            <title>{t("dispatch.collectors.chart_label")}</title>
            <defs>
                <linearGradient id="{id}-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#e6c56f" stop-opacity="0.42" />
                    <stop offset="1" stop-color="#e6c56f" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="{id}-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#b48731" />
                    <stop offset="0.5" stop-color="#fbeec0" />
                    <stop offset="1" stop-color="#d9b25c" />
                </linearGradient>
            </defs>
            {#each c.rows as row (row.y)}
                {#if row.major || row.labelled}
                    <line
                        x1={c.pad.l}
                        x2={c.width - c.pad.r}
                        y1={row.y}
                        y2={row.y}
                        stroke={row.major ? "#c9a24a" : "#ffffff"}
                        stroke-opacity={row.major ? 0.55 : 0.08}
                        stroke-dasharray={row.major ? "" : "2 4"}
                    />
                {/if}
                {#if row.labelled}
                    <text class="ylab" class:major={row.major} x={c.pad.l - 10} y={row.y + 4} text-anchor="end">
                        {row.label}
                    </text>
                {/if}
                {#if row.major && v.tierArt[row.tier]}
                    <image href={v.tierArt[row.tier]} x="2" y={row.y - 13} width="26" height="26" />
                {/if}
            {/each}
            {#each c.months as m (m.x)}
                <line x1={m.x} x2={m.x} y1={c.pad.t} y2={c.height - c.pad.b} stroke="#fff" stroke-opacity="0.07" />
                <text class="xlab" x={m.textX} y={c.height - 12} text-anchor={m.anchor}>{m.label}</text>
            {/each}
            <path d={c.area} fill="url(#{id}-area)" />
            <path
                d={c.line}
                fill="none"
                stroke="url(#{id}-line)"
                stroke-width="3.5"
                stroke-linejoin="round"
                filter="drop-shadow(0 0 4px rgb(255 220 150 / 0.5))"
            />
            <circle cx={c.start.x} cy={c.start.y} r="6" fill="#0b0910" stroke="#f1d688" stroke-width="2.5" />
            <circle cx={c.end.x} cy={c.end.y} r="6" fill="#f1d688" stroke="#0b0910" stroke-width="2" />
            <g transform="translate({c.peak.x} {c.peak.y})">
                <circle r="22" fill="#f1d688" opacity="0.18" />
                <path
                    d="M0 -13 L3.8 -4 L13 -4 L5.6 1.8 L8.4 11 L0 5.4 L-8.4 11 L-5.6 1.8 L-13 -4 L-3.8 -4 Z"
                    fill="#fff3c4"
                    stroke="#7a5716"
                    stroke-width="1"
                />
            </g>
            <g transform="translate({v.callout.x} {v.callout.y})">
                <rect width={v.callout.width} height="36" rx="3" fill="#0b0910" stroke="#c9a24a" />
                <text class="call" x="10" y="15">{t("dispatch.collectors.callout_peak")}</text>
                <text class="call-v" x="10" y="30">{v.peakName}</text>
            </g>
        </svg>
    {/if}

    <div class="moves">
        {#if v.moves}
            <div>
                <span class="n up">▲ {v.moves.ups}</span><span class="l">{t("dispatch.collectors.promotions")}</span>
            </div>
            <div>
                <span class="n down">▼ {v.moves.downs}</span><span class="l">{t("dispatch.collectors.demotions")}</span>
            </div>
        {/if}
        <div><span class="n">{v.matches}</span><span class="l">{t("dispatch.collectors.ranked_matches")}</span></div>
    </div>

    {#if v.start && v.end}
        <div class="climb">
            <div class="end">
                {#if v.start.image}<img src={v.start.image} alt="" />{/if}
                <span class="k">{t("dispatch.collectors.started")}</span>
                <span class="v" {@attach shrink(28, 16, v.start.label)}>{v.start.label}</span>
            </div>
            <div class="arrow">
                <svg viewBox="0 0 200 40" aria-hidden="true">
                    <path d="M4 20 H180" stroke="#c9a24a" stroke-width="2" stroke-dasharray="6 6" />
                    <path d="M176 10 L194 20 L176 30 Z" fill="#f1d688" />
                </svg>
                <span>{v.climb}</span>
            </div>
            <div class="end">
                {#if v.end.image}<img src={v.end.image} alt="" />{/if}
                <span class="k">{t("dispatch.collectors.finished")}</span>
                <span class="v" {@attach shrink(28, 16, v.end.label)}>{v.end.label}</span>
            </div>
        </div>
    {/if}
</Page>

<style>
    .deck {
        max-width: 560px;
        margin: 10px 0 0;
        color: #eadbb4;
        font-family: "Radiance", serif;
        font-size: 21px;
        line-height: 1.3;
    }
    .chart {
        display: block;
        margin-top: 18px;
        overflow: visible;
    }
    .ylab {
        fill: #eadbb4aa;
        font-family: "Retail Demo", sans-serif;
        font-size: 13px;
        font-weight: 600;
    }
    .ylab.major {
        fill: #f1d688;
        font-weight: 700;
    }
    .xlab {
        fill: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }
    .call {
        fill: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }
    .call-v {
        fill: #fff3c4;
        font-family: "Retail Demo", sans-serif;
        font-size: 15px;
        font-weight: 700;
    }
    .moves {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        margin-top: 16px;
        border-block: 1px solid #c9a24a88;
    }
    .moves div {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        padding: 12px 0;
    }
    .moves div + div {
        border-left: 1px solid #c9a24a55;
    }
    .n {
        font-family: "Valve Pulp", sans-serif;
        font-size: 40px;
        font-weight: 700;
        line-height: 1;
    }
    .n.up {
        color: #9fe3a5;
    }
    .n.down {
        color: #f09a8c;
    }
    .l {
        margin-top: 4px;
        color: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-align: center;
        text-transform: uppercase;
    }
    .climb {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr) 170px;
        align-items: center;
        margin-top: 22px;
    }
    .climb .end {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        text-align: center;
    }
    .climb img {
        width: 96px;
        height: 96px;
        object-fit: contain;
        filter: drop-shadow(0 6px 8px #0009);
    }
    .climb .k {
        color: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }
    .climb .v {
        max-width: 100%;
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 28px;
        font-weight: 700;
        line-height: 1.1;
        white-space: nowrap;
    }
    .arrow {
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: center;
        color: #eadbb4;
        font-family: "Radiance", serif;
        font-size: 20px;
        font-style: italic;
        text-align: center;
    }
    .arrow svg {
        width: 180px;
        max-width: 100%;
        height: 36px;
    }
</style>
