<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Page from "./page.svelte";
    import { shrink } from "./shrink";
    import type { CollectorsView } from "./view";

    let { v, alone = false }: { v: CollectorsView; alone?: boolean } = $props();

    const GUILLOCHE = Array.from({ length: 9 }, (_, i) => {
        const base = 125 + (i - 4) * 9;
        const run = Array.from(
            { length: 29 },
            (_, k) => `L${(k + 1) * 20} ${(base + Math.sin((k + i * 0.7) * 1.1) * 26).toFixed(1)}`,
        );
        return `M0 ${base} ${run.join(" ")}`;
    });
    const signature = $derived(t("dispatch.masthead.name"));
</script>

<Page side="right" {alone} label={t("dispatch.collectors.peak_label")} folio="3">
    <div class="peak">
        <div class="badge">
            <div class="glow"></div>
            {#if v.peak?.image}<img src={v.peak.image} alt="" />{/if}
        </div>
        <div class="peak-text">
            <span class="kicker">{t("dispatch.collectors.peak_label")}</span>
            <span class="name foil" {@attach shrink(66, 36, v.peakName)}>{v.peakName}</span>
            {#if v.reached}<span class="sub">{v.reached}</span>{/if}
            {#if v.matchOf}<span class="sub dim">{v.matchOf}</span>{/if}
        </div>
    </div>

    <div class="record">
        <div>
            <span class="big" {@attach shrink(64, 36, v.record)}>{v.record}</span>
            <span class="l">{t("dispatch.collectors.record")}</span>
        </div>
        {#if v.winrate}
            <div>
                <span class="big">{v.winrate}</span>
                <span class="l">{t("dispatch.collectors.won")}</span>
            </div>
        {/if}
        <div>
            <span class="big">{v.streak}</span>
            <span class="l">{t("dispatch.collectors.best_streak")}</span>
        </div>
    </div>

    {#if v.heroes.length > 0}
        <div class="heroes">
            <span class="kicker">{t("dispatch.collectors.carried")}</span>
            {#each v.heroes as h (h.id)}
                <div class="hero">
                    {#if h.art}<img src={h.art} alt="" />{:else}<span class="no-art"></span>{/if}
                    <span class="hn" {@attach shrink(26, 16, h.name)}>{h.name}</span>
                    <span class="hl">{h.line}</span>
                </div>
            {/each}
        </div>
    {/if}

    <div class="cert">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <svg class="guilloche" viewBox="0 0 560 250" preserveAspectRatio="none" aria-hidden="true">
            {#each GUILLOCHE as d, i (i)}
                <path {d} fill="none" stroke="#b48731" stroke-opacity="0.16" stroke-width="1" />
            {/each}
        </svg>
        <span class="ct">{t("dispatch.collectors.cert_title")}</span>
        <p>
            {v.certificate.before}{#if v.certificate.name !== null}<b>{v.certificate.name}</b>{/if}{v.certificate.after}
        </p>
        <div class="sign">
            <div>
                <span class="sig">{signature}</span>
                <span class="sl">{t("dispatch.collectors.issued_by")}</span>
            </div>
            <div class="sn">
                <span class="sl">{t("dispatch.collectors.copy_number")}</span>
                <span class="num">{v.serial}</span>
            </div>
            <div class="emboss" aria-hidden="true"><span>D+</span></div>
        </div>
    </div>
</Page>

<style>
    .peak {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 20px;
        align-items: center;
    }
    .badge {
        position: relative;
        width: 220px;
        height: 220px;
    }
    .badge img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 10px 14px #000000a6);
    }
    .glow {
        position: absolute;
        inset: 10px;
        background: radial-gradient(circle, #ffe29673, #0000 68%);
        border-radius: 50%;
    }
    .peak-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .peak-text .name {
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 66px;
        font-weight: 700;
        line-height: 1.02;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .sub {
        color: #eadbb4;
        font-family: "Radiance", serif;
        font-size: 21px;
    }
    .sub.dim {
        color: #eadbb4aa;
        font-size: 17px;
    }
    .record {
        display: grid;
        grid-template-columns: 1.3fr;
        grid-auto-columns: 1fr;
        grid-auto-flow: column;
        margin-top: 22px;
        border-block: 1px solid #c9a24a88;
    }
    .record div {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        padding: 14px 0 12px;
    }
    .record div + div {
        border-left: 1px solid #c9a24a55;
    }
    .big {
        max-width: 100%;
        overflow-x: clip;
        color: #fbefc2;
        font-family: "Valve Pulp", sans-serif;
        font-size: 64px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
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
    .heroes {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 24px;
    }
    .hero {
        display: grid;
        grid-template-columns: 62px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding-bottom: 8px;
        border-bottom: 1px dashed #c9a24a44;
    }
    .hero img,
    .no-art {
        width: 62px;
        height: 74px;
        object-fit: cover;
        object-position: top;
        border: 1px solid #c9a24a;
    }
    .no-art {
        display: block;
        background: #1e1730;
    }
    .hn {
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 26px;
        font-weight: 700;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .hl {
        color: #eadbb4;
        font-family: "Retail Demo", sans-serif;
        font-size: 18px;
        font-weight: 600;
        white-space: nowrap;
    }
    .cert {
        position: absolute;
        right: 60px;
        bottom: 58px;
        left: 60px;
        display: flex;
        flex-direction: column;
        height: 250px;
        padding: 22px 30px 18px;
        color: #3a2905;
        background: linear-gradient(#fbf4df, #efe3c2);
        transform: rotate(-1.2deg);
        box-shadow: 0 10px 24px #0000008c;
    }
    .guilloche {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    .corner {
        position: absolute;
        z-index: 1;
        width: 34px;
        height: 34px;
        background: #0b0910;
    }
    .tl {
        top: -6px;
        left: -6px;
        clip-path: polygon(0 0, 100% 0, 0 100%);
    }
    .tr {
        top: -6px;
        right: -6px;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
    }
    .bl {
        bottom: -6px;
        left: -6px;
        clip-path: polygon(0 0, 0 100%, 100% 100%);
    }
    .br {
        right: -6px;
        bottom: -6px;
        clip-path: polygon(100% 0, 0 100%, 100% 100%);
    }
    .ct {
        position: relative;
        color: #6a4a12;
        font-family: "Radiance", serif;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-align: center;
        text-transform: uppercase;
    }
    .cert p {
        position: relative;
        margin: 10px 0 0;
        font-family: "Radiance", serif;
        font-size: 19px;
        line-height: 1.35;
        text-align: center;
    }
    .sign {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 80px;
        gap: 18px;
        align-items: end;
        margin-top: auto;
    }
    .sign > div:first-child {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding-top: 2px;
        border-top: 1px solid #6a4a12;
    }
    .sig {
        order: -1;
        overflow-x: clip;
        color: #2b1f07;
        font-family: "Radiance", serif;
        font-size: 28px;
        font-style: italic;
        line-height: 1.1;
        white-space: nowrap;
    }
    .sl {
        color: #6a4a12;
        font-family: "Retail Demo", sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }
    .sn {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .num {
        color: #b3261e;
        font-family: "Retail Demo", sans-serif;
        font-size: 30px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.06em;
    }
    .emboss {
        display: grid;
        place-items: center;
        width: 80px;
        height: 80px;
        color: #5c410d;
        font-family: "Valve Pulp", sans-serif;
        font-size: 26px;
        font-weight: 700;
        text-shadow: 0 1px #fff3c4;
        background: repeating-conic-gradient(#c99a3e 0deg 6deg, #f1d688 6deg 12deg), #c99a3e;
        border-radius: 50%;
        box-shadow:
            inset 0 0 0 7px #e6c56f,
            inset 0 0 0 8px #8a6420,
            0 2px 3px #00000059;
    }
</style>
