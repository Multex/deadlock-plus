<script lang="ts">
    import { gameArt } from "../art";
    import { gameText } from "../text";
    import type { ComponentGroup } from "./model";
    import { cssUrl } from "./view";

    let { groups }: { groups: readonly ComponentGroup[] } = $props();

    const art = gameArt();
    const t = gameText();
    const check = $derived(cssUrl(art().ui.checkmark));
</script>

<!-- `.componentsSection`: one labelled, wrapping list per group. -->
<div class="components">
    {#each groups as group (group.kind)}
        <div class="group">
            <div class="label">{t(group.label)}</div>
            <div class="list">
                {#each group.items as { item, owned } (item.id)}
                    <span class="entry" class:owned>
                        <span class="icon-box">
                            {#if item.art}<img class="icon" src={item.art} alt="" draggable="false" />{/if}
                            {#if owned}
                                <span class="check" class:fallback={!check} style:--check={check} aria-hidden="true"
                                ></span>
                            {/if}
                        </span>
                        <span class="name">{item.name}</span>
                    </span>
                {/each}
            </div>
        </div>
    {/each}
</div>

<style>
    .components {
        display: flex;
        flex-direction: column;
        padding: 0 calc(var(--u) * 20);
    }
    /* `.componentsLabel`: 14 bold uppercase #ffffff50 on offBlack&ea. */
    .label {
        padding: calc(var(--u) * 4) calc(var(--u) * 10) calc(var(--u) * 2);
        background: var(--tt-component-label-bg);
        color: var(--tt-component-label);
        font-size: calc(var(--u) * 14);
        font-weight: 700;
        text-transform: uppercase;
    }
    .list {
        display: flex;
        flex-wrap: wrap;
        padding: 0 calc(var(--u) * 5) calc(var(--u) * 5) calc(var(--u) * 10);
        border-radius: 0 0 calc(var(--u) * 5) calc(var(--u) * 5);
        background: var(--tt-component-list-bg);
    }
    .entry {
        display: flex;
        align-items: center;
        margin-right: calc(var(--u) * 8);
    }
    .entry.owned {
        background: var(--tt-component-owned-bg);
        opacity: var(--tt-component-owned-opacity);
    }
    .icon-box {
        position: relative;
        display: flex;
        width: calc(var(--u) * 30);
        height: calc(var(--u) * 30);
        flex: none;
        margin-right: calc(var(--u) * 6);
        background: #009cb3;
    }
    .icon {
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: var(--tt-component-icon-opacity);
    }
    .owned .icon {
        opacity: var(--tt-component-owned-icon-opacity);
    }
    /* `.componentOwnedIcon`: 26 square, 3 right and down, washed fortitudeBright. */
    .check {
        position: absolute;
        top: calc(var(--u) * 5);
        left: calc(var(--u) * 5);
        width: calc(var(--u) * 26);
        height: calc(var(--u) * 26);
        background: var(--game-fortitude-bright, #7bba1d);
        mask: var(--check) center / contain no-repeat;
    }
    .check.fallback {
        top: calc(var(--u) * 4);
        left: calc(var(--u) * 11);
        width: calc(var(--u) * 8);
        height: calc(var(--u) * 16);
        border: solid var(--game-fortitude-bright, #7bba1d);
        border-width: 0 calc(var(--u) * 3) calc(var(--u) * 3) 0;
        background: none;
        mask: none;
        rotate: 45deg;
    }
    /* `.componentModName`: 14 bold offWhite&90, at most 200 wide. */
    .name {
        max-width: calc(var(--u) * 200);
        overflow: hidden;
        color: var(--tt-component-name);
        font-size: calc(var(--u) * 14);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .owned .name {
        font-style: italic;
    }
</style>
