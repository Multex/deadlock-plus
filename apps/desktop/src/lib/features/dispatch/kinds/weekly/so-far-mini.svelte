<script lang="ts">
    import MiniFrame from "../mini-frame.svelte";
    import { miniFormat, miniText, type MiniCopy, type SoFarMiniText } from "../minis";

    let { copy, height }: { copy: MiniCopy; height: number } = $props();

    const text = $derived(miniText(copy, undefined, miniFormat()) as SoFarMiniText);
</script>

<MiniFrame {copy} {height}>
    <span class="sofar">
        <span class="band"><span class="word">{text.band}</span></span>
        <span class="kick">{text.kicker}</span>
        <span class="date">{text.date}</span>
        <span class="inked">
            <span class="l"></span><span class="l"></span><span class="l s"></span><span class="l"></span>
        </span>
        <span class="roller"></span>
        <span class="blank"></span>
        <span class="stamp">{text.stamp}</span>
        <span class="foot">{text.foot}</span>
    </span>
</MiniFrame>

<style>
    /* A sheet half through the press. */
    .sofar {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--fp-paper);
        color: var(--fp-ink);
    }

    .band {
        display: flex;
        flex: none;
        align-items: baseline;
        justify-content: center;
        gap: 6px;
        margin: 9px 9px 0;
        padding: 3px 7px 1px;
        background: repeating-linear-gradient(
            -45deg,
            var(--fp-spot) 0 7px,
            color-mix(in oklch, var(--fp-spot) 50%, var(--fp-paper)) 7px 11px
        );
        color: var(--fp-paper);
        white-space: nowrap;
    }

    .word {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 24px;
        line-height: 1.1;
    }

    .kick {
        margin: 12px 12px 0;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 16px;
        letter-spacing: 0.1em;
        color: var(--fp-spot);
    }

    .date {
        margin: 2px 12px 0;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 24px;
        line-height: 1.1;
    }

    .inked {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 12px 12px 0;
        padding-top: 10px;
        border-top: 2px solid var(--fp-ink);
    }

    .inked .l {
        height: 9px;
        background: color-mix(in oklch, var(--fp-ink) 55%, transparent);
    }

    .inked .l.s {
        width: 70%;
    }

    .roller {
        position: relative;
        flex: none;
        height: 30px;
        margin: 10px -6px 0;
        border-radius: 15px;
        background: linear-gradient(
            to bottom,
            oklch(0.45 0.01 80),
            oklch(0.2 0.01 80) 35%,
            oklch(0.12 0.01 80) 70%,
            oklch(0.3 0.01 80)
        );
        box-shadow: 0 8px 12px -4px rgb(0 0 0 / 0.6);
    }

    .blank {
        flex: 1;
        margin: 10px 12px 0;
        background: repeating-linear-gradient(
            to bottom,
            color-mix(in oklch, var(--fp-ink) 9%, transparent) 0 2px,
            transparent 2px 13px
        );
    }

    /* The locale line carries its own line break. */
    .stamp {
        position: absolute;
        top: 214px;
        right: 14px;
        padding: 4px 10px;
        border: 3px solid var(--fp-spot);
        border-radius: 4px;
        color: var(--fp-spot);
        font-family: "Retail Demo", sans-serif;
        font-weight: 800;
        font-size: 18px;
        line-height: 1.05;
        text-align: center;
        text-transform: uppercase;
        white-space: pre-line;
        transform: rotate(-9deg);
        opacity: 0.88;
    }

    .foot {
        margin: 8px 12px 12px;
        padding-top: 6px;
        border-top: 2px dashed var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 15px;
        text-transform: uppercase;
        color: var(--fp-spot);
    }
</style>
