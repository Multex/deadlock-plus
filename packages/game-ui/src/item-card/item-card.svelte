<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
    import { gameArt } from "../art";
    import { gameColors } from "../colors";
    import { gameText } from "../text";
    import type { GameItem, ItemSlot } from "../item";
    import { panoramaAlpha, panoramaColor } from "../panorama";
    import {
        cardLayers,
        cardRadius,
        cardState,
        fitName,
        initials,
        NAME_BASELINE_SHIFT,
        NAME_LINE_HEIGHT,
        NAME_TRACKING,
        nameTone,
        phaseWash,
        plateColor,
        romanTier,
        textureVariant,
        tierNumeral,
        TIER_SCALE,
        type CardLayout,
        type FitOptions,
        type PopularPhase,
    } from "./card";

    type Popular = { minimap?: string } | { phase: PopularPhase };

    type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
        /** Undefined when a build holds an item the game no longer has. */
        item: GameItem | undefined;
        layout?: CardLayout;
        /** Picks the paper and icon mask; pass the card's position to cycle them like the game. */
        variant?: number;
        /** The game shows the tier corner in build lists, not in the shop grid. */
        showTier?: boolean;
        /** The game's "Active" tag; no current shop or build view shows it. */
        showActiveTag?: boolean;
        owned?: boolean;
        usedAsComponent?: boolean;
        disabled?: boolean;
        isNew?: boolean;
        /** A hero's popular item (its minimap head), or the Popular tab's phase icon. */
        popular?: Popular;
        /** How often the build holds this item; the badge shows above 0. */
        count?: number;
        countLabel?: string;
        /** Measures the name font for the shrink-to-fit size; the default estimates from glyph widths. */
        measure?: FitOptions["measure"];
        /** Overlays drawn above the card. */
        children?: Snippet;
    };

    let {
        item,
        layout = "shop",
        variant,
        showTier = layout === "build",
        showActiveTag = false,
        owned = false,
        usedAsComponent = false,
        disabled = false,
        isNew = false,
        popular,
        count = 0,
        countLabel,
        measure,
        children,
        class: className,
        ...rest
    }: Props = $props();

    const BRIGHT: Record<ItemSlot, string> = {
        weapon: gameColors.courageBright,
        vitality: gameColors.fortitudeBright,
        spirit: gameColors.spiritBright,
    };

    const text = gameText();
    const plain = (key: string) => text({ key, params: {}, game: null });
    const newLabel = $derived(plain("game_ui.item_card.new"));
    const imbueLabel = $derived(plain("builds.shop.imbue"));
    const activeLabel = $derived(plain("game_ui.item_tooltip.active"));
    const removedLabel = $derived(plain("builds.shop.removed_item"));

    const art = gameArt();
    const ui = $derived(art().ui);
    const image = (name: ShopUiImage | null) => (name ? ui[name] : undefined);
    const url = (src: string | undefined) => (src ? `url(${JSON.stringify(src)})` : undefined);

    const flags = $derived({ owned, usedAsComponent, disabled });
    const layers = $derived(
        item ? cardLayers(item, { variant: variant ?? textureVariant(item.name), layout, ...flags }) : undefined,
    );
    const look = $derived(cardState(flags));
    const tone = $derived(item ? nameTone(item.slot, item.tier, flags) : undefined);
    const label = $derived(item ? item.name : removedLabel);
    const fit = $derived(fitName(label, measure ? { measure } : {}));
    const radius = $derived(
        cardRadius(!!item?.active, layout)
            .map((r) => `calc(var(--u) * ${r})`)
            .join(" "),
    );
    const numeral = $derived(item && item.tier !== 5 ? tierNumeral(item.tier) : undefined);
    const tier = $derived(showTier && item && item.tier !== 5);
    const backer = $derived(layers ? image(layers.backer) : undefined);
    const cap = $derived(image("tier_corner"));
    const numeralArt = $derived(layers ? image(layers.numeral) : undefined);
    const iconMask = $derived(layers ? image(layers.iconMask) : undefined);
    const paperArt = $derived(layers ? image(layers.paper) : undefined);
    const spent = $derived(owned || usedAsComponent);
    const plate = $derived(item ? (spent ? gameColors.offBlack : plateColor(item.slot, item.tier)) : undefined);

    let failedArt = $state<string>();
    const showArt = $derived(!!item?.art && failedArt !== item.art);
</script>

<div
    {...rest}
    class={["item-card", className]}
    class:active={item?.active}
    class:removed={!item}
    class:shadowed={look.shadow}
    data-slot={item?.slot}
    data-tier={item?.tier}
    style:--radius={radius}
    style:--bright={item ? BRIGHT[item.slot] : undefined}
    style:--plate={plate}
    style:opacity={look.opacity}
    style:filter={look.saturation < 1 ? `saturate(${look.saturation})` : undefined}
>
    {#if item && layers}
        <div
            class="face"
            style:opacity={look.cardOpacity}
            style:--card-base={spent ? undefined : url(ui.card_base)}
            style:--card-mask={url(ui.card_base_mask)}
        >
            {#if backer}<span class="backer" style:background-image={url(backer)}></span>{/if}
            <span class="art-shadow" style:--icon-shadow={panoramaColor("offBlack&60", plate ?? gameColors.offBlack)}
            ></span>
            <div
                class="art"
                class:masked={!!iconMask}
                style:--icon-mask={url(iconMask)}
                style:--icon-mask-floor="rgb(0 0 0 / {panoramaAlpha(
                    0.5,
                    BRIGHT[item.slot],
                    plate ?? gameColors.offBlack,
                )})"
                style:filter={look.artBrightness < 1 ? `brightness(${look.artBrightness})` : undefined}
            >
                {#if showArt}
                    <img
                        src={item.art}
                        alt=""
                        draggable="false"
                        loading="lazy"
                        decoding="async"
                        onerror={() => (failedArt = item.art)}
                    />
                {:else}
                    <span class="initials" aria-hidden="true">{initials(item.name)}</span>
                {/if}
            </div>
            {#if tier && numeral}
                <span
                    class="tier"
                    aria-hidden="true"
                    style:--tier-shadow={panoramaColor("#000000ee", plate ?? gameColors.offBlack)}
                    style:--tier-scale={TIER_SCALE}
                >
                    {#if cap}
                        <span class="cap" style:--cap={url(cap)}></span>
                    {:else}
                        <span class="cap fallback"></span>
                    {/if}
                    {#if numeralArt}
                        <span
                            class="numeral"
                            style:--numeral={url(numeralArt)}
                            style:width="calc(var(--u) * {numeral.width})"
                            style:right="calc(var(--u) * {numeral.right})"
                        ></span>
                    {:else}
                        <span class="numeral-text">{romanTier(item.tier)}</span>
                    {/if}
                </span>
            {/if}
            {#if isNew && look.newTag}
                <span class="new">{newLabel}</span>
            {/if}
            {#if item.imbue}
                <span class="imbue">{imbueLabel}</span>
            {/if}
            {#if paperArt}<span class="paper" style:background-image={url(paperArt)}></span>{/if}
            {#if look.outline}<span class="outline" style:border-color={look.outline}></span>{/if}
        </div>
        {#if showActiveTag && item.active}
            <span class="active-tag" style:--tag-shadow={panoramaColor("#00000060", plate ?? gameColors.offBlack)}
                ><span style:color={panoramaColor("offWhite&aa", "#181818")}>{activeLabel}</span></span
            >
        {/if}
    {:else}
        <div class="face">
            <div class="art">
                <svg class="warn" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3 2 21h20L12 3Z" />
                    <path d="M12 10v5M12 18v.5" />
                </svg>
            </div>
        </div>
    {/if}

    <span class="name-area">
        <span
            class="name"
            style:font-size="calc(var(--u) * {fit.size})"
            style:line-height={NAME_LINE_HEIGHT}
            style:letter-spacing="{NAME_TRACKING}em"
            style:color={tone?.color}
            style:opacity={tone?.opacity}
            style:font-style={tone?.italic ? "italic" : undefined}
            style:text-shadow={tone?.shadow ? `0 0 calc(var(--u) * 12) ${tone.shadow}` : undefined}
            style:translate="0 {NAME_BASELINE_SHIFT}em"
            >{#each fit.lines as line, i (i)}{#if i > 0}{" "}{/if}<span class="line">{line}</span>{/each}</span
        >
    </span>

    {#if item && popular && look.popularity}
        {#if "phase" in popular}
            {@const wash = phaseWash(popular.phase)}
            {@const phaseArt = ui[`phase_${popular.phase}`]}
            <span class="popular phase" aria-hidden="true">
                <span
                    class="phase-icon"
                    class:washed={!!wash}
                    class:fallback={!phaseArt}
                    style:--phase={url(phaseArt)}
                    style:--wash={wash ?? gameColors.offWhite}
                ></span>
            </span>
        {:else}
            {@const thumb = ui.popular_thumb}
            <span class="popular" aria-hidden="true">
                {#if popular.minimap}
                    <img class="hero" src={popular.minimap} alt="" draggable="false" />
                {/if}
                {#if thumb}
                    <span class="thumb" style:--thumb={url(thumb)}></span>
                {:else}
                    <svg class="thumb" viewBox="0 0 12 14"><path d="M6 0 12 7H8.5v7h-5V7H0Z" /></svg>
                {/if}
            </span>
        {/if}
    {/if}

    {#if count > 0}
        <span class="count">{countLabel ?? count}</span>
    {/if}

    {@render children?.()}
</div>

<style>
    /* Geometry in Panorama px from `citadel_shop_mod_view`, through one scale factor. */
    .item-card {
        --u: calc(var(--game-ui-scale, 1) * 1px);
        --off-black: #10130d;
        --off-white: #ffefd7;
        --plate: #8a8273;
        position: relative;
        flex: none;
        width: calc(var(--u) * 76);
        height: calc(var(--u) * 114);
        margin: calc(var(--u) * 3);
        border-radius: var(--radius);
        user-select: none;
    }
    .item-card.shadowed {
        box-shadow: calc(var(--u) * 2) calc(var(--u) * 2) calc(var(--u) * 12) #0007;
    }

    /* `#ModCard` is 80 wide in the file, but the 1440p captures show the face at the card's own 76. */
    .face {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: var(--radius);
        background:
            var(--card-base, none) center / cover no-repeat,
            var(--plate);
        mask: var(--card-mask, linear-gradient(#000, #000)) center / 100% 100% no-repeat;
    }
    .backer,
    .paper,
    .outline {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }
    .backer {
        background-position: center;
        background-size: cover;
    }
    .paper {
        background-size: 100% 100%;
        mix-blend-mode: multiply;
    }
    .outline {
        z-index: 2;
        border: calc(var(--u) * 2) solid;
        border-radius: var(--radius);
    }

    /* `#ModIconImage`: 70 tall with a 1 margin; active items round it into an ellipse and skip the mask. */
    .art,
    .art-shadow {
        position: absolute;
        top: calc(var(--u) * 1);
        right: calc(var(--u) * 1);
        left: calc(var(--u) * 1);
        height: calc(var(--u) * 70);
    }
    .art {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    /*
     * The game's `box-shadow: 2px 2px 5px offBlack&60`, drawn unmasked so the shop grid's icon masks keep it.
     * Panorama's blur is tighter than a browser's: the 1440p captures put the shadow's half-dark edge 4.7 px
     * under the art and 1.5 px right of its left side, fading over ~1.4 px.
     */
    .art-shadow {
        box-shadow: calc(var(--u) * 2.3) calc(var(--u) * 2.3) calc(var(--u) * 2.1) calc(var(--u) * 1.2)
            var(--icon-shadow);
    }
    .item-card.active .art-shadow {
        border-radius: 50%;
    }
    .art.masked {
        mask-image: var(--icon-mask), linear-gradient(var(--icon-mask-floor), var(--icon-mask-floor));
        mask-size: cover;
        mask-composite: add;
    }
    .item-card.active .art {
        border-radius: 50%;
    }
    /* The captures show the art's top and sides blending into the paper over ~2 px: half at the first pixel. */
    .art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        mask:
            linear-gradient(90deg, #0005, #000 calc(var(--u) * 1.5), #000 calc(100% - var(--u) * 1.5), #0005),
            linear-gradient(#0005, #000 calc(var(--u) * 1.5));
        mask-composite: intersect;
    }
    .initials {
        color: color-mix(in srgb, var(--off-black) 45%, transparent);
        font-family: var(--game-font-oracle, "Valve Oracle", sans-serif);
        font-size: calc(var(--u) * 22);
        font-weight: 600;
    }

    /* `TierContainer`: 28 square at 140% ui-scale, the cap 22 wide, the numeral 8 tall 3 from the top. */
    .tier {
        position: absolute;
        top: 0;
        right: 0;
        width: calc(var(--u) * 28 * var(--tier-scale));
        height: calc(var(--u) * 28 * var(--tier-scale));
        filter: drop-shadow(calc(var(--u) * -4) 0 calc(var(--u) * 10) var(--tier-shadow));
    }
    .cap {
        position: absolute;
        top: 0;
        right: 0;
        width: calc(var(--u) * 22 * var(--tier-scale));
        height: calc(var(--u) * 22 * var(--tier-scale));
        background: var(--bright);
        mask: var(--cap) right top / 100% no-repeat;
    }
    /* Without the art: the cap's visible triangle, measured 29 at 1440p. */
    .cap.fallback {
        width: calc(var(--u) * 29);
        height: calc(var(--u) * 29);
        mask: none;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
    }
    .numeral {
        position: absolute;
        top: calc(var(--u) * 3 * var(--tier-scale));
        height: calc(var(--u) * 8 * var(--tier-scale));
        background: var(--off-black);
        mask: var(--numeral) center / 100% 100% no-repeat;
    }
    .numeral-text {
        position: absolute;
        top: calc(var(--u) * 3.5);
        right: calc(var(--u) * 4);
        color: var(--off-black);
        font-family: var(--game-font-sans, sans-serif);
        font-size: calc(var(--u) * 11);
        font-weight: 700;
        line-height: 1;
    }

    .new {
        position: absolute;
        top: 0;
        left: 50%;
        z-index: 1;
        padding: 0 calc(var(--u) * 5);
        border-radius: 0 0 calc(var(--u) * 3) calc(var(--u) * 3);
        background: #f83a3a;
        color: var(--off-white);
        font-family: var(--game-font-sans, sans-serif);
        font-size: calc(var(--u) * 13);
        font-weight: 700;
        translate: -50% 0;
        white-space: nowrap;
    }

    /* `imbue_tag` sits at the bottom of the 72 tall icon container; active items give it 26 instead of 16. */
    .imbue,
    .active-tag > span {
        font-family: var(--game-font-sans, sans-serif);
        font-weight: 700;
        line-height: calc(var(--u) * 16);
        text-align: center;
        text-transform: uppercase;
        white-space: nowrap;
        -webkit-text-stroke: calc(var(--u) * 3) var(--off-black);
        paint-order: stroke fill;
    }
    .imbue {
        position: absolute;
        top: calc(var(--u) * 56);
        right: 0;
        left: 0;
        z-index: 1;
        padding: 0 calc(var(--u) * 3);
        color: #e7c8ff;
        font-size: calc(var(--u) * 12);
        font-style: italic;
        letter-spacing: calc(var(--u) * 1);
    }
    .item-card.active .imbue {
        top: calc(var(--u) * 46);
    }
    .active-tag {
        position: absolute;
        right: 0;
        bottom: calc(var(--u) * 36);
        left: 0;
        z-index: 2;
        display: flex;
        height: calc(var(--u) * 20);
        align-items: center;
        justify-content: center;
    }
    .active-tag > span {
        padding: 0 calc(var(--u) * 4);
        border-radius: calc(var(--u) * 2);
        background: #181818;
        box-shadow: 0 0 calc(var(--u) * 30) var(--tag-shadow);
        font-size: calc(var(--u) * 11);
        -webkit-text-stroke: 0;
    }

    .name-area {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        height: calc(var(--u) * 40);
        align-items: center;
        justify-content: center;
        padding: calc(var(--u) * 2);
    }
    .name {
        max-width: 100%;
        overflow: hidden;
        padding: 0 calc(var(--u) * 2);
        color: var(--off-black);
        font-family: var(--game-font-oracle, "Valve Oracle", sans-serif);
        font-weight: 700;
        text-align: center;
        /* The browser draws the name ~13% heavier than the 1440p captures (summed ink over 36 cards); a
           plate-coloured stroke trims the glyph edges back to ~5%. */
        -webkit-text-stroke: calc(var(--u) * 0.1) var(--plate);
    }
    .line {
        display: block;
        white-space: nowrap;
    }

    .item-card.removed {
        border: calc(var(--u) * 1) dashed var(--warning, #f3b13c);
        box-shadow: none;
    }
    .item-card.removed .face {
        background: color-mix(in srgb, var(--warning, #f3b13c) 8%, transparent);
        mask: none;
    }
    .item-card.removed .name {
        color: var(--warning, #f3b13c);
        -webkit-text-stroke: 0;
    }
    .warn {
        width: calc(var(--u) * 28);
        height: calc(var(--u) * 28);
        fill: none;
        stroke: var(--warning, #f3b13c);
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2;
    }

    /*
     * `PopularityContainer`: 36 square, 2 past the top right corner, its content at 80% ui-scale (sizes and
     * margins x 0.8 inside the full 36). The hero-coloured star behind it is collapsed in the game's CSS.
     */
    .popular {
        position: absolute;
        top: calc(var(--u) * -2);
        right: calc(var(--u) * -2);
        z-index: 3;
        width: calc(var(--u) * 36);
        height: calc(var(--u) * 36);
        pointer-events: none;
    }
    /* The 1440p capture's head spans ~27 x 24 px inside its outline, centred on the container. */
    .hero {
        position: absolute;
        top: 50%;
        left: 50%;
        width: calc(var(--u) * 20);
        height: calc(var(--u) * 20);
        translate: -50% -50%;
        object-fit: contain;
        filter: drop-shadow(0 0 calc(var(--u) * 1) var(--off-black))
            drop-shadow(0 0 calc(var(--u) * 1) var(--off-black));
    }
    .thumb {
        position: absolute;
        right: calc(var(--u) * 2 * 0.8);
        bottom: calc(var(--u) * 7 * 0.8);
        width: calc(var(--u) * 12 * 0.8);
        height: calc(var(--u) * 14 * 0.8);
        rotate: 15deg;
        fill: #00ff99;
        filter: drop-shadow(0 0 calc(var(--u) * 1.5) var(--off-black));
    }
    span.thumb {
        background: #00ff99;
        mask: var(--thumb) center / contain no-repeat;
    }
    .phase-icon {
        position: absolute;
        top: calc(var(--u) * 3);
        right: calc(var(--u) * 5);
        width: 60%;
        height: 60%;
        background: var(--phase) center / contain no-repeat;
    }
    .phase-icon.washed {
        background: var(--wash);
        mask: var(--phase) center / contain no-repeat;
    }
    .phase-icon.fallback {
        width: 30%;
        height: 30%;
        border-radius: 50%;
        background: var(--wash);
        mask: none;
    }

    .count {
        position: absolute;
        right: calc(var(--u) * -3);
        bottom: calc(var(--u) * -3);
        z-index: 3;
        padding: 0 calc(var(--u) * 4);
        border-radius: 999px;
        background: var(--brass, #c9a227);
        box-shadow: 0 1px 3px #0008;
        color: var(--off-black);
        font-family: var(--game-font-sans, sans-serif);
        font-size: calc(var(--u) * 10);
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        line-height: calc(var(--u) * 14);
    }
</style>
