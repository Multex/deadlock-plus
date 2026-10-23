<script lang="ts">
    import { tick, type Snippet } from "svelte";
    import { on } from "svelte/events";
    import { ArrowLeft } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { moveSelection } from "../../build-list";

    let {
        keys,
        selected,
        onselect,
        label,
        open = $bindable(false),
        list,
        detail,
    }: {
        keys: readonly string[];
        selected: string | null;
        onselect: (key: string) => void;
        label: string;
        /** Narrow windows show the detail in place of the list while this is set. */
        open?: boolean;
        list: Snippet;
        detail: Snippet;
    } = $props();

    // Below this the shop no longer fits beside a readable list, so the detail takes the whole width.
    const NARROW_PX = 1100;

    let width = $state(0);
    let listEl = $state<HTMLElement | null>(null);
    let detailEl = $state<HTMLElement | null>(null);
    const narrow = $derived(width > 0 && width < NARROW_PX);

    const STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };

    function rowLink(key: string): HTMLElement | null {
        return listEl?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"] [data-row-link]`) ?? null;
    }

    async function keydown(e: KeyboardEvent) {
        const step = STEPS[e.key];
        if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const next = moveSelection(keys, selected, step);
        if (next === null) return;
        if (next !== selected) onselect(next);
        await tick();
        rowLink(next)?.focus({ preventScroll: true });
    }

    $effect(() => {
        const key = selected;
        if (key === null || (narrow && open)) return;
        void tick().then(() => rowLink(key)?.closest("[data-row]")?.scrollIntoView({ block: "nearest" }));
    });

    $effect(() => {
        void selected;
        if (detailEl) detailEl.scrollTop = 0;
    });
</script>

<div class="panes" class:narrow bind:clientWidth={width}>
    <section class="list-pane" aria-label={label} hidden={narrow && open}>
        <ul bind:this={listEl} {@attach (el) => on(el, "keydown", keydown)} data-testid="build-list">
            {@render list()}
        </ul>
    </section>
    <section class="detail-pane" bind:this={detailEl} hidden={narrow && !open} data-testid="build-detail">
        {#if narrow}
            <div class="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
                <Button variant="ghost" size="sm" onclick={() => (open = false)} data-testid="back-to-list">
                    <ArrowLeft aria-hidden="true" />
                    {t("builds.list.back")}
                </Button>
            </div>
        {/if}
        {@render detail()}
    </section>
</div>

<style>
    .panes {
        display: grid;
        grid-template-columns: minmax(26rem, 30rem) minmax(0, 1fr);
        flex: 1;
        min-height: 0;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--card);
    }
    .panes.narrow {
        grid-template-columns: minmax(0, 1fr);
    }
    .list-pane,
    .detail-pane {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    .list-pane {
        border-right: 1px solid var(--border);
        background: color-mix(in oklch, var(--background) 35%, transparent);
    }
    .narrow .list-pane {
        border-right: 0;
    }
    [hidden] {
        display: none;
    }
</style>
