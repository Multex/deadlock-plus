<script lang="ts">
    import MiniFrame from "../mini-frame.svelte";
    import MiniMast from "../mini-mast.svelte";
    import MiniPrint from "../mini-print.svelte";
    import { miniFormat, miniText, type CollectorsMiniText, type MiniCopy, type MiniCover } from "../minis";

    let {
        copy,
        cover,
        height,
        sealed = false,
    }: {
        copy: MiniCopy;
        cover?: MiniCover;
        height: number;
        /** A copy nobody has torn open yet still sits in its foil bag. */
        sealed?: boolean;
    } = $props();

    const text = $derived(miniText(copy, cover, miniFormat()) as CollectorsMiniText);
    const proof = $derived(copy.state === "proof");
    const bagged = $derived(sealed && !proof);
    const uid = $props.id();
</script>

<MiniFrame {copy} {height}>
    <span class="collectors" class:bagged class:proof>
        <span class="c-cover">
            <span class="frame"></span>
            <span class="c-top">{text.top}</span>
            <MiniMast
                text={text.mast}
                w={184}
                h={40}
                fill={proof ? "none" : `url(#${uid}-gold)`}
                stroke={proof ? "#c99a3e" : "none"}
            />
            <span class="c-strip">{text.strip}</span>
            <span class="ring" style="--tier: {cover?.badge?.color ?? '#8a6aa8'};">
                {#if cover?.badge?.image && !proof}<img src={cover.badge.image} alt="" />{/if}
            </span>
            <span class="peak">{text.peak}</span>
            <span class="c-date">{text.date}</span>
            {#if proof}<MiniPrint label={text.print} ink="#e6c56f" />{/if}
            {#if !sealed && !proof}<span class="holo"></span>{/if}
        </span>
        {#if bagged}
            <span class="bag">
                <span class="header"><span class="hang"></span></span>
                <span class="crimp"></span>
                <span class="gloss"></span>
                <span class="sticker">{text.sticker.top}<b>{text.sticker.main}</b>{text.sticker.note}</span>
            </span>
        {/if}
        <svg width="0" height="0" aria-hidden="true" style="position: absolute">
            <defs>
                <linearGradient id="{uid}-gold" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#7a5716" />
                    <stop offset="0.3" stop-color="#f3dc92" />
                    <stop offset="0.5" stop-color="#b48731" />
                    <stop offset="0.75" stop-color="#f7e8b4" />
                    <stop offset="1" stop-color="#8a6420" />
                </linearGradient>
            </defs>
        </svg>
    </span>
</MiniFrame>

<style>
    /* Gold on midnight, sealed in a foil bag until torn open. */
    .collectors {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: none;
    }

    .c-cover {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 18px 16px 14px;
        overflow: hidden;
        background:
            radial-gradient(
                circle at 50% 45%,
                color-mix(in oklch, var(--tier, #8a6aa8) 30%, transparent),
                transparent 55%
            ),
            linear-gradient(160deg, #26203d, #100d1c 70%);
        color: #e6c56f;
        box-shadow: 0 0 0 1px #00000080;
    }

    .bagged .c-cover {
        inset: 30px 10px 8px;
        padding: 12px 12px 10px;
    }

    .frame {
        position: absolute;
        inset: 7px;
        border: 2px solid #c99a3e;
        box-shadow:
            inset 0 0 0 3px #10101a,
            inset 0 0 0 4px #8a6420;
    }

    .c-top {
        position: relative;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.4em;
    }

    .c-cover :global(.mini-mast) {
        position: relative;
        margin-top: 2px;
        max-width: 100%;
    }

    .c-strip {
        position: relative;
        margin-top: 4px;
        padding: 2px 8px;
        border-block: 1px solid #c99a3e;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.2em;
        white-space: nowrap;
    }

    .ring {
        position: relative;
        display: grid;
        flex: none;
        place-items: center;
        width: 120px;
        height: 120px;
        margin-top: 16px;
        border: 3px solid #c99a3e;
        border-radius: 50%;
        background: radial-gradient(circle, color-mix(in oklch, var(--tier) 45%, transparent), transparent 70%);
        box-shadow:
            0 0 0 5px #10101a,
            0 0 0 6px #8a6420;
    }

    .bagged .ring {
        width: 104px;
        height: 104px;
        margin-top: 12px;
    }

    .ring img {
        width: 82%;
        filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.6));
    }

    .peak {
        position: relative;
        margin-top: 14px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 800;
        font-size: 24px;
        line-height: 1;
        white-space: nowrap;
        color: #f3dc92;
    }

    .c-date {
        position: relative;
        margin-top: auto;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.12em;
        white-space: nowrap;
        opacity: 0.85;
    }

    .proof .c-cover {
        background: #1a1726;
        outline: 2px dashed #c99a3e;
        outline-offset: -6px;
    }

    .proof .frame {
        display: none;
    }

    .proof .ring {
        border-style: dashed;
        box-shadow: none;
    }

    .proof :global(.mini-print) {
        margin-top: 8px;
        margin-bottom: 0;
    }

    .holo {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            115deg,
            transparent 25%,
            #ff8fd033 35%,
            #ffd77a40 42%,
            #8dffcf33 49%,
            #8ab4ff33 56%,
            transparent 66%
        );
        mix-blend-mode: screen;
    }

    .bag {
        position: absolute;
        inset: 0;
        border-radius: 6px 6px 3px 3px;
        background:
            linear-gradient(110deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.22) 30%, rgb(255 255 255 / 0.04) 45%),
            linear-gradient(160deg, #ff8fd022 10%, #ffd77a26 30%, #8dffcf22 50%, #8ab4ff26 70%, #ff8fd01f 90%);
        box-shadow:
            inset 0 0 0 1.5px rgb(255 255 255 / 0.35),
            inset 0 0 18px rgb(255 255 255 / 0.12);
    }

    .header {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        height: 26px;
        border-bottom: 1px solid rgb(255 255 255 / 0.35);
        background: rgb(255 255 255 / 0.18);
    }

    .hang {
        position: absolute;
        top: 8px;
        left: 50%;
        width: 34px;
        height: 10px;
        border-radius: 5px;
        background: rgb(0 0 0 / 0.55);
        box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.45);
        transform: translateX(-50%);
    }

    .crimp {
        position: absolute;
        top: 26px;
        right: 0;
        left: 0;
        height: 4px;
        background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.4) 0 3px, transparent 3px 6px);
    }

    .gloss {
        position: absolute;
        top: 34px;
        bottom: 12px;
        left: 22px;
        width: 26px;
        border-radius: 13px;
        background: linear-gradient(to right, transparent, rgb(255 255 255 / 0.28), transparent);
        transform: skewX(-6deg);
    }

    .sticker {
        position: absolute;
        right: 12px;
        top: 150px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 92px;
        height: 92px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #ff5a4a, #c8161b 70%);
        box-shadow:
            0 0 0 3px #f6d9a8,
            0 4px 10px rgb(0 0 0 / 0.5);
        color: #fff4e0;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 10px;
        line-height: 1.1;
        letter-spacing: 0.04em;
        text-align: center;
        transform: rotate(14deg);
    }

    .sticker b {
        font-family: "Valve Pulp", sans-serif;
        font-size: 24px;
        line-height: 1;
    }
</style>
