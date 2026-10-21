<script lang="ts">
    import type { Snippet } from "svelte";
    import { CircleHelp, Star, Trophy } from "@lucide/svelte";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { TagInfo } from "../../editor/details";
    import { tagLabel } from "../../lookups.svelte";
    import type { WinRate } from "../../public-builds";
    import type { ChipItem } from "../../shop-view";
    import TagGlyph from "./tag-glyph.svelte";

    let {
        rowKey,
        name,
        href,
        selected,
        onselect,
        hero,
        showHero = false,
        byline,
        tags,
        items,
        favourites = null,
        weekly = null,
        winRate,
        testid,
        badges,
        marks,
    }: {
        rowKey: string;
        name: string;
        /** Enter or a modified click opens it; a plain click selects the row. */
        href: string | null;
        selected: boolean;
        onselect: () => void;
        hero?: Hero;
        /** The list mixes heroes, so each row shows its own. */
        showHero?: boolean;
        byline: readonly string[];
        tags: readonly TagInfo[];
        items: readonly ChipItem[];
        favourites?: number | null;
        weekly?: number | null;
        winRate?: WinRate;
        testid?: string;
        badges?: Snippet;
        /** Small icons beside the favourite count, such as the player's own favourite mark. */
        marks?: Snippet;
    } = $props();

    const rate = $derived(
        winRate && formatNumber(winRate.wins / winRate.matches, { style: "percent", maximumFractionDigits: 0 }),
    );

    function click(e: MouseEvent) {
        // `detail` is 0 for a click the keyboard made: Enter follows the link.
        if (e.detail === 0 || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onselect();
    }
</script>

<li class="row" class:selected data-row={rowKey} data-testid={testid}>
    {#if showHero}
        <span class="portrait">
            {#if hero?.icon}
                <img src={hero.icon} alt="" loading="lazy" decoding="async" />
            {:else}
                <CircleHelp class="size-4 text-muted-foreground" aria-hidden="true" />
            {/if}
        </span>
    {/if}
    <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex min-w-0 items-center gap-2">
            {#if tags.length > 0}
                <span class="flex shrink-0 items-center gap-1 text-foreground/75">
                    {#each tags as tag (tag.id)}
                        <span title={tagLabel(tag)} class="contents"><TagGlyph {tag} class="size-[18px]" /></span>
                    {/each}
                </span>
            {/if}
            <h3 class="min-w-0 truncate text-[15px] leading-5 font-semibold">
                {#if href}
                    <a {href} class="link" aria-current={selected ? "true" : undefined} data-row-link onclick={click}
                        >{name}</a
                    >
                {:else}
                    <button
                        type="button"
                        class="link"
                        aria-current={selected ? "true" : undefined}
                        data-row-link
                        onclick={onselect}>{name}</button
                    >
                {/if}
            </h3>
            {@render badges?.()}
            <span class="ml-auto flex shrink-0 items-center gap-2 text-sm tabular-nums">
                {@render marks?.()}
                {#if favourites !== null}
                    <span
                        class="inline-flex items-center gap-1"
                        title={tn("builds.browser.favorites", favourites)}
                        data-testid="favourite-count"
                    >
                        <Star class="size-3.5 text-brass" aria-hidden="true" />
                        <span aria-hidden="true">{formatNumber(favourites)}</span>
                        <span class="sr-only">{tn("builds.browser.favorites", favourites)}</span>
                    </span>
                {/if}
            </span>
        </div>
        <div class="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            <span class="min-w-0 truncate">
                {#each byline as part, i (i)}{#if i > 0}<span aria-hidden="true">{" · "}</span>{/if}{part}{/each}
            </span>
            <span class="ml-auto flex shrink-0 items-center gap-3 tabular-nums">
                {#if weekly}<span>{t("builds.browser.this_week", { count: formatNumber(weekly) })}</span>{/if}
                {#if winRate && rate}
                    <span
                        class="inline-flex items-center gap-1 text-foreground/85"
                        title={t("builds.browser.win_rate_detail", {
                            wins: formatNumber(winRate.wins),
                            matches: formatNumber(winRate.matches),
                        })}
                        data-testid="win-rate"
                    >
                        <Trophy class="size-3 text-brass" aria-hidden="true" />
                        {t("builds.browser.win_rate", { rate })}
                    </span>
                {/if}
            </span>
        </div>
        {#if items.length > 0}
            <ul class="mt-0.5 flex gap-1" aria-hidden="true">
                {#each items as item, i (i)}
                    <li class="item" data-slot={item.slot} data-tier={item.tier} title={item.name}>
                        {#if item.art}<img src={item.art} alt="" loading="lazy" decoding="async" />{/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</li>

<style>
    .row {
        position: relative;
        display: flex;
        gap: 0.75rem;
        padding: 0.625rem 0.875rem 0.625rem 1rem;
        border-bottom: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
        transition: background-color 120ms;
    }
    .row:hover {
        background: color-mix(in oklch, var(--muted) 45%, transparent);
    }
    .row.selected {
        background: color-mix(in oklch, var(--brass) 11%, transparent);
    }
    .row.selected::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--brass);
    }
    .row:has(.link:focus-visible) {
        outline: 2px solid color-mix(in oklch, var(--ring) 60%, transparent);
        outline-offset: -2px;
    }
    /* The name's link covers the row so the whole row selects; the row's own buttons sit above it. */
    .link {
        outline: none;
        text-align: left;
    }
    .link::after {
        content: "";
        position: absolute;
        inset: 0;
    }
    .portrait {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        flex-shrink: 0;
        overflow: hidden;
        border-radius: 0.375rem;
        background: var(--muted);
    }
    .portrait img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    /* Plate tones match the shop's name plates for each slot and tier. */
    .item {
        width: 30px;
        height: 30px;
        overflow: hidden;
        border-radius: 3px;
        background: var(--plate, var(--muted));
        box-shadow: inset 0 -2px 0 var(--edge, transparent);
    }
    .item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .item[data-slot="weapon"] {
        --edge: #ec9719;
        --plate: #b2905b;
    }
    .item[data-slot="vitality"] {
        --edge: #7bba1d;
        --plate: #9ba676;
    }
    .item[data-slot="spirit"] {
        --edge: #ce90ff;
        --plate: #a49cb7;
    }
    .item[data-slot="weapon"][data-tier="1"] {
        --plate: #e0c28a;
    }
    .item[data-slot="vitality"][data-tier="1"] {
        --plate: #cbd28e;
    }
    .item[data-slot="spirit"][data-tier="1"] {
        --plate: #e7d4eb;
    }
    .item[data-slot="weapon"][data-tier="3"] {
        --plate: #9f734b;
    }
    .item[data-slot="vitality"][data-tier="3"] {
        --plate: #81905f;
    }
    .item[data-slot="spirit"][data-tier="3"] {
        --plate: #827da8;
    }
    .item[data-slot="weapon"][data-tier="4"] {
        --plate: #342d26;
    }
    .item[data-slot="vitality"][data-tier="4"] {
        --plate: #3f3d30;
    }
    .item[data-slot="spirit"][data-tier="4"] {
        --plate: #3a3434;
    }
</style>
