<script lang="ts">
    import { gameArt } from "../art";
    import { cssUrl } from "../item-tooltip/view";
    import { gameText } from "../text";
    import AbilityMarkup from "./ability-markup.svelte";
    import type { AbilityTooltipModel, UpgradeCardView } from "./model";
    import { upgradeCardClasses, upgradeCardStyle } from "./view";

    type Props = {
        card: UpgradeCardView;
        text: AbilityTooltipModel["text"];
        bindings?: Partial<Record<string, string>>;
    };

    let { card, text, bindings = {} }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const ui = $derived(art().ui);
    const look = $derived(upgradeCardStyle(upgradeCardClasses(card.state)));
    const body = $derived(cssUrl(ui[look.art]));
    const bolt = $derived(cssUrl(ui[look.bolt.art]));
</script>

<!-- `CitadelAbilityUpgradeButton`: a 30 tall cost strip over the `ap_rect_*` body. -->
<div
    class="card"
    style:--body={body}
    style:--body-fill={look.body}
    style:--strip={look.strip}
    style:--bolt={bolt}
    style:--bolt-wash={look.bolt.wash}
    style:--bolt-size={look.bolt.size}
    style:--cost={look.cost}
    style:--bonus={look.bonus.color}
    style:--bonus-opacity={look.bonus.opacity}
    style:--desc={look.desc.color}
    style:--desc-opacity={look.desc.opacity}
>
    <div class="content" class:painted={!!body}>
        <div class="strip">
            <span class="bolt" class:fallback={!bolt} aria-hidden="true"></span>
            {#if look.cost}<span class="cost">{card.cost}</span>{/if}
        </div>
        <div class="desc">
            {#if card.description}
                <span class="upgrade-desc custom"><AbilityMarkup nodes={card.description} {bindings} /></span>
            {:else}
                {#each card.bonuses as bonus (bonus.key)}
                    <span class="bonus">{bonus.amount}</span>
                    <span class="upgrade-desc">{bonus.label}</span>
                {/each}
            {/if}
        </div>
    </div>
    {#if card.recommended}<span class="recommended">{t(text.recommended)}</span>{/if}
</div>

<style>
    .card {
        position: relative;
        display: flex;
        min-width: 0;
        height: round(calc(var(--u) * 160), 1px);
        flex: 1 1 0;
        margin: 0 round(calc(var(--u) * 3), 1px);
        background: var(--at-card);
    }
    .content {
        display: flex;
        width: 100%;
        flex-direction: column;
        background-color: var(--body-fill, transparent);
    }
    .content.painted {
        background-image: var(--body);
        background-position: center;
        background-repeat: no-repeat;
        background-size: 100% 100%;
    }
    .strip {
        display: flex;
        height: round(calc(var(--u) * 30), 1px);
        flex: none;
        align-items: center;
        justify-content: center;
        margin: round(calc(var(--u) * 2), 1px);
        background: var(--strip);
    }
    .bolt {
        width: calc(var(--u) * var(--bolt-size));
        height: calc(var(--u) * var(--bolt-size));
        background:
            var(--bolt) center / contain no-repeat,
            var(--bolt-wash);
        background-blend-mode: multiply;
        mask: var(--bolt) center / contain no-repeat;
    }
    .bolt.fallback {
        background: var(--bolt-wash);
        clip-path: polygon(55% 0, 15% 55%, 45% 55%, 35% 100%, 85% 40%, 55% 40%);
        mask: none;
    }
    .cost {
        margin-left: round(calc(var(--u) * 4), 1px);
        font-size: round(down, calc(var(--u) * 20 * var(--game-font-scale)), 1px);
        font-weight: 700;
        color: var(--cost);
    }
    .desc {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: round(calc(var(--u) * 3), 1px) round(calc(var(--u) * 8), 1px);
        text-align: center;
    }
    .bonus {
        color: var(--bonus);
        font-size: round(down, calc(var(--u) * 22 * var(--game-font-scale)), 1px);
        font-weight: 700;
        opacity: var(--bonus-opacity);
    }
    /* `#upgradeDesc` is 16, which the game's font scale draws at 20 px at 1440p; the narrower box keeps the line
       breaks all three Lightning Ball cards show. */
    .upgrade-desc {
        max-width: calc(100% * 15 / 16);
        color: var(--desc);
        font-size: calc(var(--u) * 15);
        line-height: calc(var(--u) * 15 * var(--game-font-sans-leading, 1.343));
        font-weight: 600;
        opacity: var(--desc-opacity);
    }
    /* The card's `.highlight` is only bold; the tooltip body's highlight colours do not reach it. */
    .upgrade-desc :global([class^="m-highlight"]) {
        color: inherit;
    }
    .upgrade-desc :global(.m-highlight) {
        font-weight: 700;
    }
    /* `.build_next`: bold 14 uppercase on buildsDark, hanging 10 below the card. */
    .recommended {
        position: absolute;
        bottom: round(calc(var(--u) * -10), 1px);
        left: 50%;
        max-width: round(calc(var(--u) * 110), 1px);
        padding: 0 round(calc(var(--u) * 5), 1px) round(calc(var(--u) * 1), 1px);
        overflow: hidden;
        border-radius: round(calc(var(--u) * 2), 1px);
        background: var(--at-recommended);
        font-size: round(down, calc(var(--u) * 14 * var(--game-font-scale)), 1px);
        font-weight: 700;
        text-overflow: ellipsis;
        text-transform: uppercase;
        translate: -50% 0;
        white-space: nowrap;
    }
</style>
