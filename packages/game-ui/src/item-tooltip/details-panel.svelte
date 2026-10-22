<script lang="ts">
    import { gameArt } from "../art";
    import type { ItemSlot } from "../item";
    import { gameText } from "../text";
    import type { DetailsPanel } from "./model";
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
        <div class="header" style:--header-art={header}></div>
        <div class="body">
            {#each panel.groups as group, g (g)}
                <div class="group">
                    <span class="icon">
                        {#if group.icon}<img src={group.icon} alt="" draggable="false" />{/if}
                    </span>
                    <div class="rows">
                        {#each group.rows as row (row.key)}
                            <div class="row">
                                <div class="names">
                                    <span class="name">{row.label}</span>
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
    .column {
        position: relative;
        z-index: -1;
        display: flex;
        width: calc(var(--u) * 350);
        flex: none;
        align-items: flex-start;
        margin-top: calc(var(--u) * 26);
        margin-left: calc(var(--u) * -15);
    }
    .column.left {
        justify-content: flex-end;
        margin-right: calc(var(--u) * -2);
        margin-left: 0;
    }
    .panel {
        display: flex;
        width: 100%;
        flex-direction: column;
        background:
            var(--body-art, none) center / cover no-repeat,
            var(--tt-modifies-body);
        box-shadow: 0 0 calc(var(--u) * 20) var(--tt-modifies-shadow);
    }
    /* `.AffectedAbilitiesHeader`: 10 padding and no label, so a 20 tall strip. */
    .header {
        height: calc(var(--u) * 20);
        background:
            var(--header-art, none) center / 100% 100% no-repeat,
            var(--tt-modifies-header);
    }
    .body {
        display: flex;
        flex-direction: column;
        padding: calc(var(--u) * 10);
    }
    /*
     * Right of the paper the column tucks 15 under its torn edge, which would cover the start of a 10 padding (the
     * game's own icons lose ~2 there). `#ViewImpactBox` pads 20 on that side for the same edge, so the rows do too.
     */
    .column:not(.left) .body {
        padding-left: calc(var(--u) * 20);
    }
    .group {
        display: flex;
        align-items: flex-start;
        margin: calc(var(--u) * 5) 0;
        font-size: calc(var(--u) * 18);
    }
    .icon {
        display: flex;
        width: calc(var(--u) * 30);
        height: calc(var(--u) * 30);
        flex: none;
        align-items: center;
        justify-content: center;
        margin-right: calc(var(--u) * 10);
    }
    .icon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: 0.6;
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
    .name {
        overflow: hidden;
        width: calc(var(--u) * 170);
        margin-right: calc(var(--u) * 8);
        color: var(--tt-details-name);
        font-size: calc(var(--u) * 16);
        font-weight: 600;
        line-height: calc(var(--u) * 22);
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .sub {
        color: var(--tt-details-sub);
        font-size: calc(var(--u) * 14);
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
    .arrow {
        width: calc(var(--u) * 12);
        height: calc(var(--u) * 12);
        flex: none;
        margin: calc(var(--u) * 2) calc(var(--u) * 4) 0;
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
        font-size: calc(var(--u) * 16);
        font-weight: 600;
    }
</style>
