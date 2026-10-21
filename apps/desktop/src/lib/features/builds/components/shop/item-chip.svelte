<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";
    import type { Box } from "@deadlock-plus/build-layout";
    import { t } from "$lib/core/i18n.svelte";
    import type { ChipItem } from "../../shop-view";

    let {
        item,
        box,
        scale,
    }: {
        /** Undefined when the build holds an item the game no longer has. */
        item: ChipItem | undefined;
        box: Box;
        /** CSS px per game unit. */
        scale: number;
    } = $props();

    let failedArt = $state<string>();
    const showArt = $derived(!!item?.art && failedArt !== item.art);
    const initials = $derived(
        (item?.name ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0].toUpperCase())
            .join(""),
    );
</script>

<div
    class="chip"
    class:active={item?.active}
    class:removed={!item}
    data-slot={item?.slot}
    data-tier={item?.tier}
    style:left="{box.x}px"
    style:top="{box.y}px"
    style:width="{box.width}px"
    style:height="{box.height}px"
    style:--u="{scale}px"
>
    {#if item}
        <div class="art">
            {#if showArt}
                <img src={item.art} alt="" draggable="false" onerror={() => (failedArt = item.art)} />
            {:else}
                <span class="placeholder" aria-hidden="true">{initials}</span>
            {/if}
            {#if item.imbue}
                <span class="imbue">{t("builds.shop.imbue")}</span>
            {/if}
        </div>
        <span class="tier" aria-hidden="true">{item.tier}</span>
        <span class="name"><span>{item.name}</span></span>
    {:else}
        <div class="art">
            <TriangleAlert class="warn" aria-hidden="true" />
        </div>
        <span class="name"><span>{t("builds.shop.removed_item")}</span></span>
    {/if}
</div>

<style>
    .chip {
        --off-black: #10130d;
        --bright: var(--muted-foreground);
        --dark: var(--muted);
        --name-bg: var(--bright);
        --name-fg: var(--off-black);
        position: absolute;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: calc(var(--u) * 2);
        background: var(--name-bg);
        box-shadow: 2px 2px 12px #0007;
        user-select: none;
    }
    .chip[data-slot="weapon"] {
        --bright: #ec9719;
        --dark: #302306;
    }
    .chip[data-slot="vitality"] {
        --bright: #7bba1d;
        --dark: #1f3400;
    }
    .chip[data-slot="spirit"] {
        --bright: #ce90ff;
        --dark: #362147;
    }
    .chip[data-tier="4"] {
        --name-bg: var(--dark);
        outline: calc(var(--u) * 1) solid var(--bright);
        outline-offset: calc(var(--u) * -1);
    }
    .chip[data-tier="4"][data-slot="weapon"] {
        --name-fg: #e4c5a1;
    }
    .chip[data-tier="4"][data-slot="vitality"] {
        --name-fg: #c2e7cd;
    }
    .chip[data-tier="4"][data-slot="spirit"] {
        --name-fg: #e3d4f2;
    }
    .chip.active {
        border-radius: calc(var(--u) * 50) calc(var(--u) * 50) calc(var(--u) * 2) calc(var(--u) * 2);
    }
    .chip.removed {
        --name-bg: color-mix(in oklch, var(--warning) 8%, transparent);
        --name-fg: var(--warning);
        border: 1px dashed var(--warning);
        box-shadow: none;
    }

    .art {
        position: relative;
        display: flex;
        flex: 0 0 calc(var(--u) * 72);
        align-items: center;
        justify-content: center;
        margin: calc(var(--u) * 3) calc(var(--u) * 3) 0;
        border-radius: inherit;
        background: radial-gradient(
            circle at 50% 40%,
            color-mix(in oklch, var(--bright) 30%, var(--dark)),
            var(--dark)
        );
    }
    .chip[data-tier="4"] .art {
        background: radial-gradient(circle at 50% 40%, color-mix(in oklch, var(--bright) 18%, #000), #000);
    }
    .chip.removed .art {
        background: none;
    }
    .art img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .chip.active .art img {
        border-radius: 50%;
    }
    .placeholder {
        font-family: var(--font-heading);
        font-size: calc(var(--u) * 22);
        font-weight: 600;
        color: color-mix(in oklch, var(--bright) 70%, transparent);
    }
    .art :global(.warn) {
        width: calc(var(--u) * 28);
        height: calc(var(--u) * 28);
        color: var(--warning);
    }
    .imbue {
        position: absolute;
        bottom: calc(var(--u) * 2);
        left: 50%;
        translate: -50% 0;
        padding: 0 calc(var(--u) * 3);
        border-radius: 2px;
        background: #000a;
        color: #e7c8ff;
        font-size: calc(var(--u) * 9);
        font-style: italic;
        font-weight: 700;
        letter-spacing: calc(var(--u) * 0.75);
        text-transform: uppercase;
        white-space: nowrap;
    }

    .tier {
        position: absolute;
        top: 0;
        right: 0;
        width: calc(var(--u) * 22);
        height: calc(var(--u) * 22);
        padding: calc(var(--u) * 1.5) calc(var(--u) * 3) 0 0;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
        background: var(--bright);
        box-shadow: -4px 0 10px #000e;
        color: var(--off-black);
        font-family: var(--font-heading);
        font-size: calc(var(--u) * 10);
        font-weight: 600;
        line-height: 1;
        text-align: right;
    }

    .name {
        display: flex;
        flex: 1;
        min-height: 0;
        align-items: center;
        justify-content: center;
        padding: 0 calc(var(--u) * 3);
        color: var(--name-fg);
        font-family: var(--font-heading);
        font-size: calc(var(--u) * 14);
        font-weight: 600;
        line-height: 0.92;
        text-align: center;
    }
    .name > span {
        display: -webkit-box;
        overflow: hidden;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }
</style>
