<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import { gameArt } from "../art";
    import ComponentGroups from "./component-groups.svelte";
    import DetailsBox from "./details-box.svelte";
    import type { ItemTooltipModel } from "./model";
    import PopularityLine from "./popularity-line.svelte";
    import TooltipHeader from "./tooltip-header.svelte";
    import TooltipSection from "./tooltip-section.svelte";
    import { cssUrl, styleVars, tooltipVars } from "./view";

    type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
        /** From `itemTooltipModel`. */
        model: ItemTooltipModel;
        /**
         * Key labels by the game's action name, for the description's key bindings and the ALT box's
         * `ExtraInfo` key. A binding without a label shows the action name; the ALT box shows no key.
         */
        bindings?: Partial<Record<string, string>>;
    };

    let { model, bindings = {}, class: className, style, ...rest }: Props = $props();

    const art = gameArt();
    const ui = $derived(art().ui);
    const slot = $derived(model.header.slot);
    const backer = $derived(cssUrl(ui[`tooltip_backer_${slot}`]));
    const mask = $derived(cssUrl(ui[`tooltip_backer_${slot}_mask`]));
    const vars = $derived(styleVars({ ...tooltipVars(slot), "--backer": backer, "--backer-mask": mask }));
</script>

<!-- `CitadelTooltipModDetails`: the main column and, with ALT details, the 350 wide column beside it. -->
<div
    {...rest}
    class={["item-tooltip", className]}
    class:left={model.details?.side === "left"}
    data-slot={slot}
    style={style ? `${vars}; ${style}` : vars}
>
    <div class="main" style:width="calc(var(--u) * {model.width})">
        <div class="paper" class:painted={!!backer} class:masked={!!mask}>
            <TooltipHeader header={model.header} width={model.width} />
            <div class="attributes">
                {#each model.sections as section, i (i)}
                    <TooltipSection {section} text={model.text} {bindings} />
                {/each}
            </div>
            {#if model.popularity}<PopularityLine popularity={model.popularity} />{/if}
            {#if model.components.length > 0}<ComponentGroups groups={model.components} />{/if}
        </div>
    </div>
    {#if model.details}<DetailsBox details={model.details} {slot} keyLabel={bindings.ExtraInfo} />{/if}
</div>

<style>
    .item-tooltip {
        --u: calc(var(--game-ui-scale, 1) * 1px);
        position: relative;
        z-index: 0;
        display: flex;
        width: max-content;
        align-items: stretch;
        color: var(--game-off-white, #ffefd7);
        font-family: var(--game-font-sans);
        font-size: calc(var(--u) * 18);
        font-weight: 400;
        line-height: 1.2;
        pointer-events: none;
        text-align: left;
    }
    .item-tooltip.left {
        flex-direction: row-reverse;
    }
    /* `#ModTooltipContainer`'s `img-shadow` follows the masked paper's edge, so it sits on a wrapper. */
    .main {
        position: relative;
        z-index: 1;
        flex: none;
        filter: drop-shadow(0 0 calc(var(--u) * 10) #000000);
    }
    .paper {
        display: flex;
        min-height: 100%;
        flex-direction: column;
        padding-bottom: calc(var(--u) * 30);
        background: var(--tt-paper);
    }
    .paper.painted {
        background: var(--backer) center / 100% 100% no-repeat;
    }
    .paper.masked {
        mask: var(--backer-mask) center / 100% 100% no-repeat;
    }
    .attributes {
        margin: calc(var(--u) * 1);
        padding: calc(var(--u) * 10) calc(var(--u) * 20) 0;
    }
</style>
