<script lang="ts">
    import { gameArt } from "../art";
    import { gameText } from "../text";
    import GameIcon from "./game-icon.svelte";
    import type { SectionView } from "./model";
    import ValueText from "./value-text.svelte";
    import { cssUrl } from "./view";

    let { section }: { section: SectionView } = $props();

    const art = gameArt();
    const text = gameText();
    const ui = $derived(art().ui);
    const paint = (url: string | undefined) => (url ? { image: cssUrl(url) ?? "none", wash: null } : null);
</script>

<!-- `.CooldownHeader`: 32 tall, its pills on the right at full height. -->
<div class="bar" class:active={section.bar === "active"}>
    {#if section.label}<span class="label">{text(section.label)}</span>{/if}
    <span class="pills">
        {#if section.stacks}
            <span class="pill stacks">
                <span class="stacks-label">{section.stacks.label}</span>
                <span class="pill-value">{section.stacks.count}</span>
            </span>
        {/if}
        {#if section.cooldown}
            <span class="pill">
                <span class="pill-icon"><GameIcon paint={paint(ui.cooldown_large)} size={22} fallback="#ffffff" /></span
                >
                <span class="pill-value"><ValueText value={section.cooldown} /></span>
            </span>
        {/if}
        {#if section.chargeUp}
            <span class="pill">
                <span class="pill-icon"
                    ><GameIcon paint={paint(ui.charge_up_large)} size={22} fallback="#ffffff" /></span
                >
                <span class="pill-value"><ValueText value={section.chargeUp} /></span>
            </span>
        {/if}
    </span>
</div>

<style>
    .bar {
        display: flex;
        height: calc(var(--u) * 32);
        align-items: center;
        background: var(--tt-bar-passive);
    }
    .bar.active {
        background: var(--tt-bar-active);
    }
    /* `.ActivePassiveLabel`: bold on Active; Passive italic semi-bold at 0.5. */
    .label {
        margin: 0 calc(var(--u) * 8) calc(var(--u) * 2) calc(var(--u) * 10);
        font-style: italic;
        font-weight: 600;
        opacity: var(--tt-bar-dim);
        white-space: nowrap;
    }
    .active .label {
        font-style: normal;
        font-weight: 700;
        opacity: 1;
    }
    .pills {
        display: flex;
        height: 100%;
        margin-left: auto;
    }
    .pill {
        display: flex;
        height: 100%;
        align-items: center;
        padding: 0 calc(var(--u) * 20);
        background: var(--game-off-black, #10130d);
    }
    /* `.StacksContainer` is washed with the slot colour. */
    .pill.stacks {
        padding: 0 calc(var(--u) * 20) 0 calc(var(--u) * 15);
        background: var(--tt-stacks-bg);
        color: var(--tt-stacks-wash);
        --tt-affix: currentColor;
    }
    .stacks-label {
        margin-right: calc(var(--u) * 8);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-weight: 600;
        opacity: var(--tt-stacks-label-opacity);
    }
    .pill-icon {
        display: inline-flex;
        margin-right: calc(var(--u) * 5);
    }
    /* `CitadelModifiedAttributeLabel`: an oracle base label, bold. */
    .pill-value {
        margin-bottom: calc(var(--u) * 1);
        font-family: var(--game-font-oracle);
        font-weight: 700;
        text-shadow: calc(var(--u) * 1) calc(var(--u) * 1) 0 var(--tt-text-shadow);
        white-space: nowrap;
    }
    .stacks .pill-value {
        font-family: var(--game-font-sans);
        text-shadow: none;
    }
</style>
