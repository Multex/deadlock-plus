<script lang="ts">
    import MiniFrame from "../mini-frame.svelte";
    import MiniPrint from "../mini-print.svelte";
    import { miniFormat, miniText, type MiniCopy, type MiniCover, type WeeklyMiniText } from "../minis";

    let { copy, cover, height }: { copy: MiniCopy; cover?: MiniCover; height: number } = $props();

    const text = $derived(miniText(copy, cover, miniFormat()) as WeeklyMiniText);
    const proof = $derived(copy.state === "proof");
    const art = $derived(cover?.photo ?? cover?.portrait ?? null);
</script>

<MiniFrame {copy} {height}>
    <span class="weekly" class:proof>
        <span class="band"><span class="word">{text.band}</span></span>
        <span class="when" class:tight={text.spansYears}>{text.when}</span>
        {#if proof}
            <span class="w-proof">
                <span class="bar"></span><span class="bar short"></span>
                <MiniPrint label={text.print} ink="var(--fp-ink)" />
            </span>
        {:else}
            <span class="hl">{text.headline}</span>
            <span class="lower">
                <span class="photo">
                    {#if art}<img src={art} alt="" />{/if}
                </span>
                <span class="cols"></span>
            </span>
        {/if}
        <span class="fold"></span>
    </span>
</MiniFrame>

<style>
    /* The top half of a folded tabloid. */
    .weekly {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        background: var(--fp-paper);
        background-image: radial-gradient(ellipse at 50% 30%, transparent 55%, var(--fp-paper-edge) 140%);
        color: var(--fp-ink);
        box-shadow: 0 1px 0 var(--fp-paper-edge);
    }

    .band {
        display: flex;
        flex: none;
        align-items: baseline;
        justify-content: center;
        gap: 6px;
        margin: 9px 9px 0;
        padding: 3px 7px 1px;
        background: var(--fp-spot);
        color: var(--fp-paper);
        white-space: nowrap;
    }

    .word {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 18px;
        line-height: 1.1;
    }

    .when {
        flex: none;
        margin: 5px 10px 0;
        padding-bottom: 3px;
        border-bottom: 2px solid var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 17px;
        line-height: 1.15;
        letter-spacing: 0.02em;
        white-space: nowrap;
        overflow: hidden;
    }

    .when.tight {
        letter-spacing: 0;
    }

    .proof .when {
        color: var(--fp-ink-soft);
    }

    .hl {
        display: -webkit-box;
        flex: none;
        margin: 6px 10px 0;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 19px;
        line-height: 1.08;
        text-transform: uppercase;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }

    .lower {
        display: flex;
        flex: 1;
        gap: 8px;
        min-height: 0;
        margin: 6px 10px 0;
        border-top: 1px solid var(--fp-ink);
        padding-top: 5px;
    }

    .photo {
        position: relative;
        flex: none;
        width: 92px;
        overflow: hidden;
        background: color-mix(in oklch, var(--fp-ink) 12%, transparent);
    }

    .photo img {
        width: 100%;
        filter: grayscale(1) contrast(1.4);
        mix-blend-mode: multiply;
    }

    .cols {
        flex: 1;
        background: repeating-linear-gradient(
            to bottom,
            color-mix(in oklch, var(--fp-ink) 32%, transparent) 0 3px,
            transparent 3px 8px
        );
    }

    /* The crease: the sheet folds under along the bottom edge. */
    .fold {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 14px;
        background: linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.22) 80%, rgb(255 255 255 / 0.25));
    }

    .weekly.proof {
        background: var(--fp-paper-edge);
        outline: 2px dashed color-mix(in oklch, var(--fp-ink) 40%, transparent);
        outline-offset: -5px;
    }

    .proof .band {
        background: none;
        color: var(--fp-ink-soft);
        box-shadow: inset 0 0 0 2px currentcolor;
    }

    .w-proof {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 7px;
        padding: 10px 10px 0;
    }

    .w-proof .bar {
        height: 13px;
        background: color-mix(in oklch, var(--fp-ink) 16%, transparent);
    }

    .w-proof .bar.short {
        width: 60%;
    }

    /* Proofs pack over each other on the stand: the chip sits in the left part that stays showing. */
    .w-proof :global(.mini-print) {
        align-self: flex-start;
        margin-bottom: 12px;
    }
</style>
