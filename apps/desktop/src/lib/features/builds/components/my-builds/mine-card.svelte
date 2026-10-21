<script lang="ts">
    import type { Snippet } from "svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import BuildPreview from "../shop/build-preview.svelte";
    import { visibility } from "../shop/visibility.svelte";
    import type { ChipItem } from "../../shop-view";

    let {
        name,
        href,
        build,
        resolve,
        testid,
        lead,
        trailing,
        meta,
    }: {
        name: string;
        /** The whole card links here; a card with no page to open is not a link. */
        href: string | null;
        build: BuildView | null;
        resolve: ((abilityId: number) => ChipItem | undefined) | null;
        testid?: string;
        lead?: Snippet;
        /** Sits above the card's link, so its buttons stay clickable. */
        trailing?: Snippet;
        meta?: Snippet;
    } = $props();

    const SCREEN: Screen = { width: 2560, height: 1440 };

    const filled = $derived(!!build && build.modCategories.some((c) => c.mods.length > 0));
    // Many cards to a page: each preview draws once it scrolls near the viewport.
    const preview = visibility();
</script>

<article
    class="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-brass/60 focus-within:border-brass"
    data-testid={testid}
>
    <div class="preview border-b border-border bg-background/40 p-2" inert {@attach preview.attach}>
        {#if build && resolve && filled && preview.seen}
            <BuildPreview {build} {resolve} screen={SCREEN} maxHeight={256} />
        {/if}
        <div class="fade" aria-hidden="true"></div>
    </div>
    <div class="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <div class="flex items-center gap-2">
            {@render lead?.()}
            <h3 class="min-w-0 truncate text-base font-semibold">
                {#if href}
                    <a {href} class="after:absolute after:inset-0 focus-visible:outline-none">{name}</a>
                {:else}
                    {name}
                {/if}
            </h3>
            <div class="relative z-10 ml-auto flex shrink-0 items-center gap-1.5">
                {@render trailing?.()}
            </div>
        </div>
        {@render meta?.()}
    </div>
</article>

<style>
    .preview {
        position: relative;
        min-height: 6rem;
        max-height: 16rem;
        overflow: hidden;
    }
    .fade {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, transparent 85%, var(--card));
        pointer-events: none;
    }
</style>
