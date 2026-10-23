<script lang="ts">
    import { gameArt } from "../art";
    import type { ItemSlot } from "../item";
    import { gameText } from "../text";
    import type { DetailsPanel } from "./model";
    import { shrinkToFit } from "./shrink";
    import { cssUrl } from "./view";

    type Props = { panel: DetailsPanel; side: "left" | "right"; slot: ItemSlot };

    let { panel, side, slot }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const ui = $derived(art().ui);
    const header = $derived(cssUrl(ui[`tooltip_modifies_header_${slot}`]));
    // `.TechMod .AffectedAbilitiesTogglePanel` has no image, only its colour.
    const body = $derived(slot === "spirit" ? undefined : cssUrl(ui[`tooltip_modifies_bg_${slot}`]));
    const arrow = $derived(cssUrl(ui.arrow_delta));
</script>

<!-- `.AffectedAbilitiesContainer` while ALT is held: the header strip, then `citadel_ui_modified_stats_panel` rows. -->
<div class="column" class:left={side === "left"}>
    <div
        class="panel"
        style:--body-art={body}
        style:--value={panel.valueColor}
        style:--postfix={panel.postfixColor}
        style:--arrow={arrow}
    >
        <div class="header" class:labelled={!!panel.heading} style:--header-art={header}>
            {#if panel.heading}<span class="heading">{t(panel.heading)}</span>{/if}
        </div>
        <div class="body">
            {#each panel.groups as group, g (g)}
                <div class="group" class:imbued={group.imbued}>
                    <span class="icon {group.kind}">
                        {#if group.icon && group.kind !== "item"}
                            <span class="glyph" style:--glyph={cssUrl(group.icon)}></span>
                        {:else if group.icon}
                            <img src={group.icon} alt="" draggable="false" />
                        {/if}
                    </span>
                    <div class="rows">
                        {#each group.rows as row (row.key)}
                            <div class="row">
                                <div class="names">
                                    <span class="name" use:shrinkToFit={row.label}>{row.label}</span>
                                    {#if row.subText}<span class="sub">{row.subText}</span>{/if}
                                </div>
                                <div class="values">
                                    <span class="current">{row.before}</span>
                                    <span class="arrow" class:fallback={!arrow} aria-hidden="true"></span>
                                    <span class="new">{row.after}</span>
                                    {#if row.postfix}<span class="postfix">{row.postfix}</span>{/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
            {#if panel.phases}
                <!-- Not a game panel: Deadlock+'s match stats, set apart under the game's rows. -->
                <div class="phases">
                    <span class="sub">{t(panel.phases.heading)}</span>
                    {#each panel.phases.lines as line (line.phase)}
                        {@const phaseArt = ui[`phase_${line.phase}`]}
                        <div class="group">
                            <span class="icon">
                                {#if phaseArt}<img src={phaseArt} alt="" draggable="false" />{/if}
                            </span>
                            <div class="rows">
                                <div class="row">
                                    <span class="name">{t(line.label)}</span>
                                    <span class="values rates">{t(line.rates)}</span>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    /* The game tucks the column 17 px under the paper's right edge at 1440p, hiding its icons; ours meets the
       paper's outermost torn point instead, which the stretched backer art puts 0.5-1.6 inside the box on every slot. */
    .column {
        position: relative;
        z-index: -1;
        display: flex;
        width: calc(var(--u) * 350);
        flex: none;
        align-items: flex-start;
        margin-top: calc(var(--u) * 26);
        margin-left: calc(var(--u) * -1);
    }
    .column.left {
        justify-content: flex-end;
        margin-right: calc(var(--u) * -1);
        margin-left: 0;
    }
    .panel {
        display: flex;
        width: 100%;
        flex-direction: column;
        /* Top-anchored: a short column shows the art's lighter top rows, as the 1440p captures do. */
        background:
            var(--body-art, none) center top / cover no-repeat,
            var(--tt-modifies-body);
        box-shadow: 0 0 calc(var(--u) * 20) var(--tt-modifies-shadow);
    }
    /* `.AffectedAbilitiesHeader`: 10 padding around a label that only shows with a build note, else a 20 tall strip.
       The art is drawn at its own 781x200 from the top left, unstretched: the captures show only its left part. */
    .header {
        box-sizing: border-box;
        min-height: calc(var(--u) * 20);
        padding: calc(var(--u) * 10);
        background:
            var(--header-art, none) left top / calc(var(--u) * 781) calc(var(--u) * 200) no-repeat,
            var(--tt-modifies-header);
    }
    /* 59 tall at 1440p with the label, so the label's line is 24. `.AffectedAbilitiesHeader Label` is bold 18;
       "Modifies" inks 87 wide there, which is Valve Oracle at 23 px. */
    .heading {
        display: block;
        color: var(--game-off-white, #ffefd7);
        font-family: var(--game-font-oracle);
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
        font-weight: 700;
        line-height: calc(var(--u) * 24);
        white-space: nowrap;
    }
    /* Padding and margins round to whole pixels as Panorama's do: at 1440p groups sit 14 apart (54 for a one-row
       group), not 13.3. */
    .body {
        display: flex;
        flex-direction: column;
        padding: round(calc(var(--u) * 10), 1px);
    }
    .group {
        display: flex;
        align-items: flex-start;
        margin: round(calc(var(--u) * 5), 1px) 0;
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
    }
    .group.imbued {
        background: var(--game-spirit-dark, #613484);
    }
    .icon {
        display: flex;
        box-sizing: border-box;
        width: calc(var(--u) * 30);
        height: calc(var(--u) * 30);
        flex: none;
        align-items: center;
        justify-content: center;
        margin-right: calc(var(--u) * 10);
    }
    /* `#AbilityImage`: an owned item's art. Ability and stat icons are glyphs, below. */
    .icon img {
        width: 100%;
        height: 100%;
        border-radius: calc(var(--u) * 5);
        object-fit: contain;
        opacity: 0.6;
    }
    /* `.AffectedAbility #Icon`: a #ffffff60 disc around the glyph. A stat's glyph has no disc; both are washed
       offBlack at full opacity (the Spirit Resist shield measures #0e110a-#13140c in the 1440p capture). */
    .icon.ability {
        padding: calc(var(--u) * 4);
        border-radius: 50%;
        background: var(--tt-details-disc);
    }
    .glyph {
        width: 100%;
        height: 100%;
        background: var(--game-off-black, #10130d);
        mask: var(--glyph) center / contain no-repeat;
    }
    /* `#AffectedPropertiesContainer` is 90% wide in the game, but its rows' values end inside the body's padding. */
    .rows {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        align-self: center;
    }
    .row {
        display: flex;
        min-height: calc(var(--u) * 24);
        align-items: center;
    }
    .names {
        display: flex;
        min-width: 0;
        flex-direction: column;
    }
    /* `text-overflow: shrink`: `shrinkToFit` lowers the size of a name wider than 170. */
    .name {
        overflow: hidden;
        width: calc(var(--u) * 170);
        margin-right: calc(var(--u) * 8);
        color: var(--tt-details-name);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-weight: 600;
        line-height: calc(var(--u) * 22);
        white-space: nowrap;
    }
    .sub {
        color: var(--tt-details-sub);
        font-size: round(down, calc(var(--u) * 14 * var(--game-font-scale)), 1px);
        font-style: italic;
        font-weight: 500;
        line-height: calc(var(--u) * 18);
    }
    .values {
        display: flex;
        flex: none;
        align-items: center;
        margin-left: auto;
        line-height: calc(var(--u) * 24);
        white-space: nowrap;
    }
    .current {
        color: var(--tt-details-current);
        font-weight: 600;
    }
    /* The game's margins are 4, but its ink gaps measure 12 before the arrow and 10 after it at 1440p (Close
       Quarters, Monster Rounds, Enchanter's Emblem); 6 and 5 give those here. */
    .arrow {
        width: calc(var(--u) * 12);
        height: calc(var(--u) * 12);
        flex: none;
        margin: calc(var(--u) * 2) calc(var(--u) * 5) 0 calc(var(--u) * 6);
        background: var(--tt-details-arrow);
        mask: var(--arrow) center / contain no-repeat;
    }
    .arrow.fallback {
        mask: none;
        clip-path: polygon(0 35%, 55% 35%, 55% 10%, 100% 50%, 55% 90%, 55% 65%, 0 65%);
    }
    .new {
        color: var(--value);
        font-family: var(--game-font-sans-mono);
        font-weight: 700;
    }
    .postfix {
        color: var(--postfix, inherit);
    }
    .phases {
        display: flex;
        flex-direction: column;
        padding-top: calc(var(--u) * 5);
        margin-top: calc(var(--u) * 5);
        border-top: calc(var(--u) * 1) solid var(--tt-details-arrow);
    }
    .rates {
        color: var(--tt-details-current);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-weight: 600;
    }
</style>
