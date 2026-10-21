<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import { gameArt } from "../art";
    import { cssUrl, styleVars } from "../item-tooltip/view";
    import AbilityChip from "./ability-chip.svelte";
    import AbilitySection from "./ability-section.svelte";
    import type { AbilityTooltipModel } from "./model";
    import UpgradeCard from "./upgrade-card.svelte";
    import { abilityNameSize, abilityTooltipVars } from "./view";

    type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
        /** From `abilityTooltipModel`. */
        model: AbilityTooltipModel;
        /** Key labels by the game's action name, for the descriptions' key bindings. */
        bindings?: Partial<Record<string, string>>;
    };

    let { model, bindings = {}, class: className, style, ...rest }: Props = $props();

    const art = gameArt();
    const backer = $derived(cssUrl(art().ui.ability_tooltip_bg));
    const vars = $derived(styleVars({ ...abilityTooltipVars(), "--backer": backer }));
</script>

<!-- `CitadelTooltipAbilityDetails`: 560 wide with 10 padding, the upgrade cards under the panel. -->
<div {...rest} class={["ability-tooltip", className]} style={style ? `${vars}; ${style}` : vars}>
    <div class="contents">
        <div class="backer" class:painted={!!backer}></div>
        <div class="details">
            <div class="header">
                <div class="left">
                    <span class="name" style:font-size="calc(var(--u) * {abilityNameSize(model.name)})"
                        >{model.name}</span
                    >
                    {#if model.chips.length > 0}
                        <div class="chips">
                            {#each model.chips as chip (chip.key)}<AbilityChip {chip} />{/each}
                        </div>
                    {/if}
                </div>
                <div class="right">
                    {#if model.charges || model.chargeCooldown}
                        <div class="chips">
                            {#if model.charges}<AbilityChip chip={model.charges} />{/if}
                            {#if model.chargeCooldown}<AbilityChip chip={model.chargeCooldown} between />{/if}
                        </div>
                    {/if}
                    {#if model.cooldown}<AbilityChip chip={model.cooldown} />{/if}
                </div>
            </div>
            <div class="sections">
                {#each model.sections as section, i (i)}
                    <AbilitySection {section} text={model.text} {bindings} />
                {/each}
            </div>
        </div>
    </div>
    {#if model.upgrades.length > 0}
        <div class="upgrades">
            {#each model.upgrades as card (card.tier)}<UpgradeCard {card} text={model.text} {bindings} />{/each}
        </div>
    {/if}
</div>

<style>
    .ability-tooltip {
        --u: calc(var(--game-ui-scale, 1) * 1px);
        box-sizing: border-box;
        width: calc(var(--u) * 560);
        padding: calc(var(--u) * 10);
        color: var(--game-off-white, #ffefd7);
        font-family: var(--game-font-sans);
        font-size: calc(var(--u) * 18);
        font-weight: 400;
        line-height: 1.2;
        pointer-events: none;
        text-align: left;
    }
    .contents {
        position: relative;
        z-index: 0;
    }
    /* `.TexturePanel`: the art at 100% x 100%, inset 10 top and bottom, with a 20 black shadow. */
    .backer {
        position: absolute;
        z-index: -1;
        inset: calc(var(--u) * 10) 0;
        background: var(--game-off-black, #10130d);
        box-shadow: 0 0 calc(var(--u) * 20) #000000;
    }
    .backer.painted {
        background: var(--backer) center / 100% 100% no-repeat;
        box-shadow: none;
        filter: drop-shadow(0 0 calc(var(--u) * 20) #000000);
    }
    .details {
        padding: calc(var(--u) * 10) 0;
    }
    /* `.HeaderContainer`: the name and its chips on the left, charges and cooldown pinned top right. */
    .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: calc(var(--u) * 20) calc(var(--u) * 20) calc(var(--u) * 20) calc(var(--u) * 30);
    }
    .left {
        display: flex;
        min-width: 0;
        flex-direction: column;
    }
    /* `.AbilityName`: oracle bold 36, at most 370 wide. */
    .name {
        max-width: calc(var(--u) * 370);
        margin: 0 0 calc(var(--u) * 10) calc(var(--u) * 6);
        overflow: hidden;
        font-family: var(--game-font-oracle);
        font-weight: 700;
        line-height: calc(var(--u) * 50);
        white-space: nowrap;
    }
    .chips {
        display: flex;
    }
    .right {
        display: flex;
        flex: none;
        flex-direction: column;
        align-items: flex-end;
    }
    .sections {
        padding: 0 calc(var(--u) * 30) calc(var(--u) * 20) calc(var(--u) * 40);
    }
    /* `.AbilityList` (margin-top -14) and `CitadelAbilityUpgradeList` (padding 10 8 10 20). */
    .upgrades {
        display: flex;
        margin-top: calc(var(--u) * -14);
        padding: calc(var(--u) * 10) calc(var(--u) * 8) calc(var(--u) * 10) calc(var(--u) * 20);
    }
</style>
