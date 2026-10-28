<script lang="ts">
    import type { Attachment } from "svelte/attachments";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import MiniFrame from "../mini-frame.svelte";
    import MiniMast from "../mini-mast.svelte";
    import MiniPrint from "../mini-print.svelte";
    import {
        fitFontSize,
        miniFormat,
        miniPlayer,
        miniText,
        type MiniCopy,
        type MiniCover,
        type YearEndMiniText,
    } from "../minis";

    let { copy, cover, height }: { copy: MiniCopy; cover?: MiniCover; height: number } = $props();

    const NAME_MAX = 28;
    const NAME_MIN = 16;

    // The page only shows the signed-in account's own editions, so its name today is the same player's.
    const player = $derived(miniPlayer(cover?.player, steamAccount.account?.personaName));
    const text = $derived(miniText(copy, cover && { ...cover, player }, miniFormat()) as YearEndMiniText);
    const proof = $derived(copy.state === "proof");
    const uid = $props.id();

    /** Steps the name down to fit the frame; past the floor it ends in an ellipsis. Again once the fonts land. */
    function fitName(name: string): Attachment<HTMLElement> {
        void name;
        return (el) => {
            const fit = () => {
                const size = fitFontSize(
                    (px) => {
                        el.style.fontSize = `${px}px`;
                        return el.scrollWidth;
                    },
                    el.clientWidth,
                    NAME_MAX,
                    NAME_MIN,
                );
                el.style.fontSize = `${size}px`;
            };
            fit();
            void document.fonts?.ready.then(fit);
        };
    }
</script>

<MiniFrame {copy} {height}>
    <span class="yearend" class:proof>
        {#if cover?.portrait && !proof}<img class="por" src={cover.portrait} alt="" />{/if}
        <span class="y-frame"></span>
        <span class="y-top">{text.top}</span>
        <span class="y-sub">{text.sub}</span>
        <MiniMast
            text={text.year}
            w={200}
            h={78}
            fill={proof ? "none" : `url(#${uid}-ygold)`}
            stroke={proof ? "#c99a3e" : "none"}
        />
        <span class="y-poty" class:alone={!proof && !text.name}>{text.title}</span>
        {#if proof}
            <MiniPrint label={text.print} ink="#e6c56f" />
        {:else}
            {#if text.name}
                <span class="y-name" title={player} {@attach fitName(text.name)}>{text.name}</span>
            {/if}
            <span class="flapc"><span>{text.flap}</span></span>
        {/if}
        <svg width="0" height="0" aria-hidden="true" style="position: absolute">
            <defs>
                <linearGradient id="{uid}-ygold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#fbf3c6" />
                    <stop offset="0.38" stop-color="#e2c063" />
                    <stop offset="0.55" stop-color="#9c7526" />
                    <stop offset="0.72" stop-color="#ead08a" />
                    <stop offset="1" stop-color="#8a6420" />
                </linearGradient>
            </defs>
        </svg>
    </span>
</MiniFrame>

<style>
    /* Black and gold, thick with the fold-out inside: the stacked edges are the poster's folds. */
    .yearend {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow: visible;
        padding: 20px 16px 16px;
        background: oklch(0.15 0.01 80);
        color: #e6c56f;
        box-shadow:
            3px -3px 0 oklch(0.86 0.025 86),
            6px -6px 0 oklch(0.2 0.01 80),
            9px -9px 0 oklch(0.86 0.025 86),
            12px -12px 0 oklch(0.2 0.01 80);
    }

    .por {
        position: absolute;
        right: -10px;
        bottom: 40px;
        height: 64%;
        opacity: 0.55;
        /* Cards crop the body flat at the sides too: fade those crops into the cover like the bottom. */
        mask-image:
            linear-gradient(to bottom, black 40%, transparent 92%),
            linear-gradient(to right, transparent 0%, black 16%, black 84%, transparent 100%);
        mask-composite: intersect;
    }

    .y-frame {
        position: absolute;
        inset: 8px;
        border: 2px solid #c99a3e;
        box-shadow:
            inset 0 0 0 4px oklch(0.15 0.01 80),
            inset 0 0 0 5px #8a6420;
    }

    .y-top {
        position: relative;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.22em;
        white-space: nowrap;
    }

    .y-sub {
        position: relative;
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid #8a6420;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 10px;
        letter-spacing: 0.16em;
        white-space: nowrap;
    }

    .yearend :global(.mini-mast) {
        position: relative;
        margin-top: 10px;
        font-family: "Valve Pulp", sans-serif;
        filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.6));
    }

    .y-poty {
        position: relative;
        margin-top: auto;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 600;
        font-size: 19px;
        color: #f4ecd6;
        text-shadow: 0 2px 6px rgb(0 0 0 / 0.9);
        white-space: nowrap;
    }

    .y-poty.alone {
        margin-bottom: 40px;
    }

    .y-name {
        position: relative;
        box-sizing: border-box;
        max-width: 100%;
        margin-bottom: 18px;
        padding: 0 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 28px;
        line-height: 1.1;
        white-space: nowrap;
        text-shadow: 0 2px 6px rgb(0 0 0 / 0.9);
    }

    .flapc {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 64px;
        height: 64px;
        background: linear-gradient(315deg, oklch(0.95 0.07 92), #c99a3e 40%, oklch(0.62 0.11 74));
        clip-path: polygon(100% 0, 100% 100%, 0 100%);
    }

    .flapc span {
        position: absolute;
        right: 3px;
        bottom: 8px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 800;
        font-size: 8px;
        line-height: 1.05;
        color: #2a2008;
        text-align: right;
        white-space: pre;
        transform: rotate(-45deg) translate(2px, -6px);
    }

    .yearend.proof {
        background: oklch(0.22 0.01 80);
        box-shadow: none;
        outline: 2px dashed #c99a3e;
        outline-offset: -6px;
    }

    .proof .y-frame {
        display: none;
    }

    .proof .y-poty {
        color: #c9b98f;
        font-size: 16px;
    }

    .proof :global(.mini-print) {
        margin-top: 10px;
    }
</style>
