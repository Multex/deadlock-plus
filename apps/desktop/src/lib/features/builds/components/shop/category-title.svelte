<script lang="ts">
    import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t } from "$lib/core/i18n.svelte";

    type Fit = "full" | "squished" | "gone";

    let {
        category,
        label = category.name,
        unnamed = false,
        unit,
        reserve = 0,
        ondblclick,
    }: {
        category: Pick<ModCategoryView, "name" | "description" | "optional" | "width" | "mods">;
        /** What the name shows; the editor shows a placeholder for an empty name. */
        label?: string;
        unnamed?: boolean;
        /** CSS px per game unit. */
        unit: number;
        /** CSS px at the row's end that something drawn over the header covers; OPTIONAL and the description stop short of it. */
        reserve?: number;
        ondblclick?: (event: MouseEvent) => void;
    } = $props();

    const description = $derived(category.description.trim());

    let row = $state<HTMLElement>();
    let name = $state<HTMLElement>();
    let pill = $state<HTMLElement | null>(null);
    let text = $state<HTMLElement | null>(null);
    let pillFit = $state<Fit>("full");
    let textFit = $state<Fit>("full");

    /** Squished to less than one "…" of its own font, the game draws nothing there. */
    function fitOf(node: HTMLElement | null, padding: number, font: number): Fit {
        if (!node) return "full";
        if (node.clientWidth - padding < font) return "gone";
        return node.scrollWidth > node.clientWidth + 0.5 ? "squished" : "full";
    }

    // Read in the next frame and only written when it changed: writing from inside the observer re-lays the
    // header out and trips the browser's ResizeObserver loop guard.
    let frame = 0;
    function measure() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const pillNow = fitOf(pill, 8 * unit, 12 * unit);
            const textNow = fitOf(text, 0, 15 * unit);
            if (pillNow !== pillFit) pillFit = pillNow;
            if (textNow !== textFit) textFit = textNow;
        });
    }

    $effect(() => {
        if (!row || !name) return;
        void category.name;
        void category.width;
        void category.mods.length;
        void unit;
        void reserve;
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        observer.observe(name);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    });

    const fallback = $derived(!!description && textFit === "gone" && !(category.optional && pillFit === "squished"));
</script>

<!-- As the game: a wrapped name takes the whole width; OPTIONAL and the description get what is left, the description first. -->
<div class="title" bind:this={row} style:--u="{unit}px" style:--reserve="{reserve}px">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="name" class:unnamed bind:this={name} {ondblclick}>{label}</span>
    {#if category.optional}
        <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger class="optional-pill {pillFit}">
                {#snippet child({ props })}
                    <span {...props} bind:this={pill}>{t("builds.shop.optional")}</span>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="whitespace-pre-line">
                {t("builds.shop.optional")}{#if description && textFit === "gone"}<br />{description}{/if}
            </Tooltip.Content>
        </Tooltip.Root>
    {/if}
    {#if description}
        <Tooltip.Root delayDuration={100} disabled={textFit !== "squished"}>
            <Tooltip.Trigger class="description {textFit}">
                {#snippet child({ props })}
                    <span {...props} bind:this={text}>{description}</span>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="whitespace-pre-line">{description}</Tooltip.Content>
        </Tooltip.Root>
    {/if}
    {#if reserve > 0}
        <span class="reserve" aria-hidden="true"></span>
    {/if}
    {#if fallback}
        <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger
                class="more"
                aria-label={t("builds.shop.description")}
                data-testid="category-description-more"
            >
                …
            </Tooltip.Trigger>
            <Tooltip.Content class="whitespace-pre-line">{description}</Tooltip.Content>
        </Tooltip.Root>
    {/if}
</div>

<style>
    /* Game units through --u: name 16 bold, margins 12 left / 6 top / 4; OPTIONAL 12 bold; description 15 semi-bold at 60%. */
    .title {
        position: relative;
        display: flex;
        width: 100%;
        height: 100%;
        min-width: 0;
        align-items: center;
        overflow: hidden;
    }
    .name {
        flex: 0 0 auto;
        align-self: flex-start;
        max-width: calc(100% - var(--u) * 16);
        margin: calc(var(--u) * 6) calc(var(--u) * 4) 0 calc(var(--u) * 12);
        color: var(--foreground);
        font-size: calc(var(--u) * 16);
        font-weight: 700;
        line-height: calc(var(--u) * 21);
        overflow-wrap: break-word;
    }
    .name.unnamed {
        color: var(--muted-foreground);
        font-style: italic;
        font-weight: 600;
    }
    .title :global(.optional-pill),
    .title :global(.description) {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .title :global(.optional-pill) {
        flex: 0 1 auto;
        margin: 0 calc(var(--u) * 4) 0 calc(var(--u) * -2);
        padding: 0 calc(var(--u) * 4);
        border-radius: 2px;
        background: #00000050;
        color: color-mix(in oklch, #85b5ff 90%, transparent);
        font-size: calc(var(--u) * 12);
        font-weight: 700;
        line-height: 1.4;
        text-transform: uppercase;
        cursor: help;
    }
    /* Shrinks long before the pill does, so the pill keeps its room as in the game. */
    .title :global(.description) {
        flex: 0 100000 auto;
        margin: 0 calc(var(--u) * 4);
        color: color-mix(in oklch, var(--foreground) 60%, transparent);
        font-size: calc(var(--u) * 15);
        font-weight: 600;
    }
    .reserve {
        flex: 0 0 var(--reserve);
    }
    .title :global(.description.squished) {
        cursor: help;
    }
    .title :global(.gone) {
        visibility: hidden;
    }
    .title :global(.more) {
        position: absolute;
        right: calc(var(--reserve) + var(--u) * 4);
        bottom: calc(var(--u) * 4);
        padding: 0 calc(var(--u) * 4);
        border: 0;
        border-radius: 2px;
        background: #00000050;
        color: color-mix(in oklch, var(--foreground) 70%, transparent);
        font: inherit;
        font-size: calc(var(--u) * 12);
        font-weight: 700;
        line-height: 1.4;
        cursor: help;
    }
    .title :global(:is(.optional-pill, .description, .more):focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
</style>
