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
                    <span class="name" style:--name-size={abilityNameSize(model.name)}>{model.name}</span>
                    {#if model.chips.length > 0}
                        <div class="chips">
                            {#each model.chips as chip (chip.key)}<AbilityChip {chip} framed />{/each}
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
    /* Panorama draws text at whole pixels, rounded down (Lightning Ball at 1440p: the 18s at 23, the 36 name at 47),
       and sizes a line box by the font's own ascent and descent unless a rule sets a line-height. */
    .ability-tooltip {
        --u: calc(var(--game-ui-scale, 1) * 1px);
        /* `.AbilityPropertyName` is 17 with `text-overflow: shrink` under `max-height: 20`: it shrinks until its
           line box fits 20. Retail Demo's box is 1.343 em, so the capture's labels draw at 19 px. */
        --at-name-size: round(
            down,
            min(
                calc(var(--u) * 17 * var(--game-font-scale)),
                calc(var(--u) * 20 / var(--game-font-sans-leading, 1.343))
            ),
            1px
        );
        box-sizing: border-box;
        width: round(calc(var(--u) * 560), 1px);
        padding: round(calc(var(--u) * 10), 1px);
        color: var(--game-off-white, #ffefd7);
        font-family: var(--game-font-sans);
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
        font-weight: 400;
        line-height: normal;
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
        inset: round(calc(var(--u) * 10), 1px) 0;
        background: var(--game-off-black, #10130d);
        box-shadow: 0 0 calc(var(--u) * 20) #000000;
    }
    .backer.painted {
        background: var(--backer) center / 100% 100% no-repeat;
        box-shadow: none;
        filter: drop-shadow(0 0 calc(var(--u) * 20) #000000);
    }
    .details {
        padding: round(calc(var(--u) * 10), 1px) 0;
    }
    /* `.HeaderContainer`: the name and its chips on the left, charges and cooldown pinned top right. */
    .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: round(calc(var(--u) * 20), 1px) round(calc(var(--u) * 20), 1px) round(calc(var(--u) * 20), 1px)
            round(calc(var(--u) * 30), 1px);
    }
    .left {
        display: flex;
        min-width: 0;
        flex-direction: column;
    }
    /* `.AbilityName`: oracle bold 36, at most 370 wide, in a 50 tall box. Measured (Lightning Ball): the game draws
       it 2 px higher in that box than centred at 1440p, so 3 of the 50 move under the line. */
    .name {
        max-width: round(calc(var(--u) * 370), 1px);
        margin: 0 0 round(calc(var(--u) * 13), 1px) round(calc(var(--u) * 6), 1px);
        overflow: hidden;
        font-family: var(--game-font-oracle);
        font-size: round(down, calc(var(--u) * var(--name-size) * var(--game-font-scale)), 1px);
        font-weight: 700;
        line-height: round(calc(var(--u) * 47), 1px);
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
        padding: 0 round(calc(var(--u) * 30), 1px) round(calc(var(--u) * 20), 1px) round(calc(var(--u) * 40), 1px);
    }
    /* `.AbilityList` (margin-top -14) and `CitadelAbilityUpgradeList` (padding 10 8 10 20). */
    .upgrades {
        display: flex;
        margin-top: round(calc(var(--u) * -14), 1px);
        padding: round(calc(var(--u) * 10), 1px) round(calc(var(--u) * 8), 1px) round(calc(var(--u) * 10), 1px)
            round(calc(var(--u) * 20), 1px);
    }
</style>
