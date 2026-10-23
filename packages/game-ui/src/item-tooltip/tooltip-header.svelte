<script lang="ts">
    import { gameArt } from "../art";
    import { gameText } from "../text";
    import type { ItemTooltipModel } from "./model";
    import { cssUrl, headerNameSize } from "./view";

    type Props = { header: ItemTooltipModel["header"]; width: number };

    let { header, width }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const ui = $derived(art().ui);
    const band = $derived(cssUrl(ui[`tooltip_header_${header.slot}`]));
    const soul = $derived(cssUrl(ui.soul_icon));
    const check = $derived(cssUrl(ui.purchased_check));
    let failed = $state<string | null>(null);
    const nameSize = $derived(headerNameSize(header.name, width));
    const abilityIcon = $derived(header.imbued?.icon && failed !== header.imbued.icon ? header.imbued.icon : null);
</script>

<!-- `.HeaderContainer`: at least 96 tall, padding 20 25, on the slot's painted band. -->
<header class="header" class:painted={!!band} style:--band={band}>
    <span
        class="name"
        style:font-size="round(down, calc(var(--u) * {nameSize} * var(--game-font-scale)), 1px)"
        style:line-height="calc(var(--u) * {nameSize} * var(--tt-oracle-line))">{header.name}</span
    >
    {#if header.cost !== null}
        <span class="state priced" class:cant-afford={header.cantAfford}>
            <span class="soul" class:fallback={!soul} style:--soul={soul} aria-hidden="true"></span>
            <span class="cost">{header.cost}</span>
        </span>
    {:else if header.imbued}
        <span class="state">
            <span class="imbued">{t(header.imbued.text)}</span>
            {#if abilityIcon}
                <img
                    class="ability"
                    src={abilityIcon}
                    alt=""
                    draggable="false"
                    onerror={() => (failed = abilityIcon)}
                />
            {/if}
        </span>
    {:else if header.owned}
        <span class="state">
            <span class="owned">{t(header.owned)}</span>
            <span class="check" class:fallback={!check} style:--check={check} aria-hidden="true"></span>
        </span>
    {/if}
</header>

<style>
    .header {
        display: flex;
        box-sizing: border-box;
        width: 100%;
        min-height: calc(var(--u) * 96);
        flex-direction: column;
        justify-content: center;
        padding: calc(var(--u) * 20) calc(var(--u) * 25);
        background: var(--tt-header-fallback);
    }
    .header.painted {
        background: var(--band) center top / cover no-repeat;
    }
    /*
     * `.ModName`: oracle bold 36, shrunk to one line. Panorama draws it higher in its label box than a browser
     * centres it in a line: measured at 1440p against the paper's torn top edge, the name ink and the header's
     * bottom both sit 2-3 px higher than a full line box gives.
     */
    .name {
        margin-top: calc(var(--u) * -2);
        font-family: var(--game-font-oracle);
        font-weight: 700;
        text-shadow: calc(var(--u) * 2) calc(var(--u) * 2) 0 var(--tt-name-shadow);
        white-space: nowrap;
    }
    /* The header ends 1-2 px sooner below this line than its line box gives (1440p: Spirit Burn, Veil Walker,
       Close Quarters, Warp Stone). */
    .state {
        display: flex;
        align-items: center;
        margin-bottom: calc(var(--u) * -1);
    }
    .priced {
        align-items: flex-start;
    }
    /* `.goldIcon`: 16 x 22, 3 down, washed shardColor. */
    .soul {
        width: calc(var(--u) * 16);
        height: calc(var(--u) * 22);
        flex: none;
        margin-top: calc(var(--u) * 3);
        background: var(--game-shard, #99ffd6);
        mask: var(--soul) center / contain no-repeat;
    }
    /* `.cantAfford .goldIcon` / `.cantAfford .ModCost`. */
    .cant-afford .soul,
    .cant-afford .cost {
        --game-shard: var(--tt-cant-afford);
    }
    .soul.fallback {
        mask: none;
        clip-path: polygon(50% 20%, 85% 50%, 50% 80%, 15% 50%);
    }
    /*
     * `.ModCost`: numericBlock bold 20 in shardColor, plain digits, centred beside the top-aligned glyph. Its
     * line box is Panorama's, measured at 1440p.
     */
    .cost {
        align-self: center;
        line-height: calc(var(--u) * 20 * 1.375);
        color: var(--game-shard, #99ffd6);
        font-family: var(--game-font-numeric-block);
        font-size: round(down, calc(var(--u) * 20 * var(--game-font-scale)), 1px);
        font-weight: 700;
    }
    .owned {
        margin-right: calc(var(--u) * 5);
        color: var(--tt-owned);
        font-size: round(down, calc(var(--u) * 20 * var(--game-font-scale)), 1px);
        font-weight: 700;
    }
    .check {
        width: calc(var(--u) * 23);
        height: calc(var(--u) * 23);
        background: var(--check) center / contain no-repeat;
    }
    .check.fallback {
        width: calc(var(--u) * 8);
        height: calc(var(--u) * 14);
        margin: 0 calc(var(--u) * 7) calc(var(--u) * 4);
        border: solid var(--game-shard, #99ffd6);
        border-width: 0 calc(var(--u) * 3) calc(var(--u) * 3) 0;
        background: none;
        rotate: 45deg;
    }
    .imbued {
        margin-right: calc(var(--u) * 3);
        color: var(--tt-imbued);
        font-size: round(down, calc(var(--u) * 20 * var(--game-font-scale)), 1px);
        font-style: italic;
        font-weight: 700;
    }
    /* `#ModImbuedContainer #ImbueAbilityIcon`: `CitadelAbilityIcon`'s 100 px image at 20% ui-scale. */
    .ability {
        width: calc(var(--u) * 20);
        height: calc(var(--u) * 20);
        flex: none;
        margin-left: calc(var(--u) * 5);
        object-fit: contain;
    }
</style>
