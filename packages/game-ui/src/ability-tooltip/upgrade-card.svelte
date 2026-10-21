<script lang="ts">
    import { gameArt } from "../art";
    import { cssUrl } from "../item-tooltip/view";
    import { gameText } from "../text";
    import AbilityMarkup from "./ability-markup.svelte";
    import type { AbilityTooltipModel, UpgradeCardView } from "./model";
    import { upgradeArt } from "./view";

    type Props = {
        card: UpgradeCardView;
        text: AbilityTooltipModel["text"];
        bindings?: Partial<Record<string, string>>;
    };

    let { card, text, bindings = {} }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const ui = $derived(art().ui);
    const body = $derived(cssUrl(ui[upgradeArt(card.state)]));
    const bolt = $derived(cssUrl(card.state === "has" ? ui.ability_upgrade_check : ui.ability_point));
</script>

<!-- `CitadelAbilityUpgradeButton`: a 30 tall cost strip over the `ap_rect_*` body. -->
<div
    class="card"
    class:has={card.state === "has"}
    class:available={card.state === "available"}
    class:cant-afford={card.state === "cantAfford"}
>
    <div class="content" style:--body={body} class:painted={!!body}>
        <div class="strip">
            <span class="bolt" class:fallback={!bolt} style:--bolt={bolt} aria-hidden="true"></span>
            {#if card.state !== "has"}<span class="cost">{card.cost}</span>{/if}
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
        height: calc(var(--u) * 160);
        flex: 1 1 0;
        margin: 0 calc(var(--u) * 3);
        background: var(--at-card);
    }
    .content {
        display: flex;
        width: 100%;
        flex-direction: column;
    }
    .content.painted {
        background: var(--body) center / 100% 100% no-repeat;
    }
    .cant-afford .content {
        background-color: var(--at-card-cant-afford);
    }
    .has .content {
        background-color: var(--at-strip);
    }
    /* `.abilityPointsRequiredContainer`: offBlack, deadlockGreenDarker once trained. */
    .strip {
        display: flex;
        height: calc(var(--u) * 30);
        flex: none;
        align-items: center;
        justify-content: center;
        margin: calc(var(--u) * 2);
        background: var(--at-strip);
    }
    .has .strip {
        background: var(--at-strip-has);
    }
    /* `.abilityPointBolt`: the AP glyph washed deadlockGreen; colorEnemy when it cannot be afforded. */
    .bolt {
        --wash: var(--at-bolt);
        width: calc(var(--u) * 16);
        height: calc(var(--u) * 16);
        background:
            var(--bolt) center / contain no-repeat,
            var(--wash);
        background-blend-mode: multiply;
        mask: var(--bolt) center / contain no-repeat;
    }
    .bolt.fallback {
        background: var(--wash);
        clip-path: polygon(55% 0, 15% 55%, 45% 55%, 35% 100%, 85% 40%, 55% 40%);
        mask: none;
    }
    .cant-afford .bolt {
        --wash: var(--at-enemy);
    }
    .has .bolt {
        --wash: var(--at-check);
        width: calc(var(--u) * 20);
        height: calc(var(--u) * 20);
    }
    .cost {
        margin-left: calc(var(--u) * 4);
        font-size: calc(var(--u) * 20);
        font-weight: 700;
    }
    .cant-afford .cost {
        color: var(--at-enemy);
    }
    .desc {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: calc(var(--u) * 3) calc(var(--u) * 8);
        text-align: center;
    }
    /* `.upgradeBonusAmount`: bold 22. */
    .bonus {
        font-size: calc(var(--u) * 22);
        font-weight: 700;
    }
    /* `#upgradeDesc`: semi-bold 16 at .6. */
    .upgrade-desc {
        font-size: calc(var(--u) * 16);
        font-weight: 600;
        opacity: var(--at-card-desc-opacity);
    }
    .cant-afford .bonus,
    .cant-afford .upgrade-desc {
        opacity: var(--at-card-dim-opacity);
    }
    .has .bonus,
    .has .upgrade-desc {
        opacity: 1;
    }
    /* `.build_next`: bold 14 uppercase on buildsDark, hanging 10 below the card. */
    .recommended {
        position: absolute;
        bottom: calc(var(--u) * -10);
        left: 50%;
        max-width: calc(var(--u) * 110);
        padding: 0 calc(var(--u) * 5) calc(var(--u) * 1);
        overflow: hidden;
        border-radius: calc(var(--u) * 2);
        background: var(--at-recommended);
        font-size: calc(var(--u) * 14);
        font-weight: 700;
        text-overflow: ellipsis;
        text-transform: uppercase;
        translate: -50% 0;
        white-space: nowrap;
    }
</style>
