<script lang="ts">
    import { tick } from "svelte";
    import { LoaderCircle, Printer } from "@lucide/svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import { unstyledButtonClass } from "@deadlock-plus/ui/button.svelte";
    import type { EditionWindow } from "@deadlock-plus/stats/dispatch/types";
    import { PAPER_STYLE } from "$lib/features/front-page/paper/tokens";
    import type { PaperKind, StandItem } from "../page-state";
    import { pileKeys, rackCapacity, rackSlots, rackStep } from "../rack";

    let {
        row,
        items,
        selected,
        focusId,
        unseen,
        printing,
        label,
        spine,
        pileLabel,
        onchoose,
    }: {
        row: number;
        /** Newest first. */
        items: readonly StandItem[];
        selected: string | null;
        /** The one paper or pile the rack's Tab stop lands on. */
        focusId: string | null;
        unseen: readonly string[];
        printing: string | null;
        label: (window: EditionWindow) => string;
        /** The short date on a paper's edge, the part still showing when it stands behind others. */
        spine: (window: EditionWindow) => string;
        pileLabel: (key: string) => string;
        onchoose: (item: StandItem) => void;
    } = $props();

    /** The narrowest edge of a paper left showing behind the one in front: still readable and clickable. */
    const MIN_SLIVER = 28;
    const GAP = 10;
    /** Width and height of each look against a weekly paper's width. */
    const SIZE: Record<PaperKind, { w: number; h: number }> = {
        so_far: { w: 1, h: 1.5 },
        weekly: { w: 1, h: 1.5 },
        monthly: { w: 1, h: 1.65 },
        collectors: { w: 1.06, h: 1.7 },
        year_end: { w: 1.18, h: 1.89 },
    };

    let bayW = $state(0);
    let bayH = $state(0);
    let chosen = $state<string | null>(null);
    let bay = $state<HTMLElement | null>(null);

    const windowOf = (item: StandItem) => (item.kind === "so_far" ? item.window : item.entry.window);
    const paths = $derived(
        items.map((item) => {
            const w = windowOf(item);
            return { id: item.id, path: item.kind === "so_far" ? [] : pileKeys(item.paper, w.startS, w.tz) };
        }),
    );
    const byId = $derived(new Map(items.map((item) => [item.id, item])));
    // The pile holding the selected paper stands open, so the selection always shows.
    const open = $derived(chosen ?? paths.find((p) => p.id === selected)?.path.at(-1) ?? null);

    const unit = $derived(bayH > 0 ? bayH / Math.max(...items.map((i) => SIZE[i.paper].h)) : 0);
    const widest = $derived(unit * Math.max(...items.map((i) => SIZE[i.paper].w)));
    const slots = $derived(unit > 0 ? rackSlots(paths, rackCapacity(bayW, widest, MIN_SLIVER), open) : []);
    const step = $derived(rackStep(slots.length, bayW, widest, GAP));

    const pathOf = $derived(new Map(paths.map((p) => [p.id, p.path])));
    const firstOpenCol = $derived(
        open === null ? -1 : slots.findIndex((s) => pathOf.get(s.kind === "paper" ? s.id : s.ids[0])?.includes(open)),
    );

    const status = (item: StandItem) => (item.kind === "so_far" ? "so_far" : item.entry.status);
    const usable = (item: StandItem) => status(item) !== "too_few";

    function face(item: StandItem) {
        const w = windowOf(item);
        const base = { kind: t(`dispatch.shelf.kind_${item.paper}`), date: label(w), spine: spine(w) };
        if (item.kind === "so_far") {
            const so = t("dispatch.stamp.so_far");
            return { ...base, foot: so, detail: so };
        }
        const { entry } = item;
        if (entry.status === "printable") {
            return { ...base, foot: t("dispatch.shelf.print_short"), detail: t("dispatch.shelf.print") };
        }
        if (entry.status === "too_few") {
            return {
                ...base,
                foot: tn("dispatch.shelf.matches", entry.matches),
                detail: tn("dispatch.shelf.too_few", entry.matches),
            };
        }
        const number = entry.number === null ? "" : t("dispatch.shelf.number", { number: entry.number });
        const detail = unseen.includes(item.id)
            ? t("dispatch.shelf.entry", { date: number, detail: t("dispatch.shelf.new") })
            : number;
        return { ...base, foot: number, detail };
    }

    async function fan(key: string, focus: boolean) {
        chosen = key;
        if (!focus) return;
        await tick();
        bay?.querySelector<HTMLElement>(`[data-rack-pile-first="${CSS.escape(key)}"]`)?.focus();
    }

    function onpilekey(e: KeyboardEvent, key: string) {
        if (e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        void fan(key, true);
    }

    const pileTop = (ids: string[]) => byId.get(ids[0])!;
    const tabbable = (ids: string[]) => focusId !== null && ids.includes(focusId);
</script>

<div class="bay" style="--u: {unit}px;" bind:this={bay} bind:clientWidth={bayW} bind:clientHeight={bayH}>
    {#each slots as slot, col (slot.kind === "paper" ? slot.id : `pile-${slot.key}`)}
        {@const z = slots.length - col}
        {#if slot.kind === "paper"}
            {@const item = byId.get(slot.id)!}
            {@const f = face(item)}
            {@const st = status(item)}
            <button
                type="button"
                class="{unstyledButtonClass} paper paper-{item.paper} {st}"
                class:selected={selected === item.id}
                class:behind={col > 0 && step < unit * SIZE[item.paper].w}
                style="{PAPER_STYLE}; left: {col * step}px; z-index: {z}; width: {unit *
                    SIZE[item.paper].w}px; height: {unit * SIZE[item.paper].h}px; --tilt: {col === 0
                    ? 0
                    : ((col * 7) % 5) - 2}deg;"
                data-rack-row={row}
                data-rack-col={col}
                data-rack-pile-first={col === firstOpenCol ? open : undefined}
                tabindex={focusId === item.id ? 0 : -1}
                aria-disabled={!usable(item) || (st === "printable" && printing !== null) ? "true" : undefined}
                aria-current={selected === item.id ? "true" : undefined}
                aria-label={t("dispatch.shelf.entry", { date: f.date, detail: f.detail })}
                onclick={() => usable(item) && onchoose(item)}
            >
                <span class="sheet" aria-hidden="true">
                    <span class="bar">{t("dispatch.page.title")}</span>
                    <span class="kind">{f.kind}</span>
                    <span class="date">{f.date}</span>
                    {#if item.paper === "so_far"}<span class="unset"></span>{/if}
                    <span class="rule"></span>
                    <span class="foot">
                        {#if printing === item.id}
                            <LoaderCircle class="size-3 animate-spin" />{t("dispatch.shelf.printing")}
                        {:else}
                            {#if st === "printable"}<Printer class="size-3" />{/if}{f.foot}
                        {/if}
                    </span>
                </span>
                <span class="spine" aria-hidden="true">{f.spine}</span>
                {#if unseen.includes(item.id)}
                    <span class="new" aria-hidden="true">{t("dispatch.shelf.new")}</span>
                {/if}
            </button>
        {:else}
            {@const top = pileTop(slot.ids)}
            {@const name = pileLabel(slot.key)}
            <button
                type="button"
                class="{unstyledButtonClass} paper pile paper-{top.paper}"
                class:behind={col > 0 && step < unit * SIZE[top.paper].w}
                style="{PAPER_STYLE}; left: {col * step}px; z-index: {z}; width: {unit *
                    SIZE[top.paper].w}px; height: {unit * SIZE[top.paper].h}px; --tilt: 0deg;"
                data-rack-row={row}
                data-rack-col={col}
                data-rack-pile-first={col === firstOpenCol ? open : undefined}
                tabindex={tabbable(slot.ids) ? 0 : -1}
                aria-expanded="false"
                aria-label={tn("dispatch.shelf.pile", slot.ids.length, { label: name })}
                onclick={() => fan(slot.key, false)}
                onkeydown={(e) => onpilekey(e, slot.key)}
            >
                <span class="sheet" aria-hidden="true">
                    <span class="bar">{t("dispatch.page.title")}</span>
                    <span class="kind">{t(`dispatch.shelf.kind_${top.paper}`)}</span>
                    <span class="date">{name}</span>
                    <span class="rule"></span>
                </span>
                <span class="spine" aria-hidden="true">
                    <span class="count">{slot.ids.length}</span>{name}
                </span>
            </button>
        {/if}
    {/each}
</div>

<style>
    .bay {
        --gold: oklch(0.8 0.11 85);
        --gold-deep: oklch(0.58 0.1 75);
        --year-black: oklch(0.17 0.01 80);
        position: relative;
        flex: 1;
        min-height: 0;
    }

    .paper {
        --band: var(--fp-spot);
        --band-ink: var(--fp-paper);
        position: absolute;
        bottom: 0;
        display: flex;
        color: var(--fp-ink);
        background-color: var(--fp-paper);
        background-image: radial-gradient(ellipse at 50% 40%, transparent 55%, var(--fp-paper-edge) 130%);
        box-shadow:
            -1px 0 0 rgb(0 0 0 / 0.12),
            -6px 0 10px -6px rgb(0 0 0 / 0.55),
            0 6px 12px -6px rgb(0 0 0 / 0.55);
        transform: rotate(calc(var(--tilt) * 0.4));
        transform-origin: 50% 100%;
        transition:
            transform 140ms,
            box-shadow 140ms;
    }

    /* Lifted out of the stack: drawn over its neighbours and clear of the ledge. */
    .paper:hover,
    .paper:focus-visible {
        z-index: 100 !important;
        transform: translateY(-12%);
        box-shadow:
            0 0 0 1px rgb(0 0 0 / 0.2),
            0 14px 24px -8px rgb(0 0 0 / 0.65);
    }

    .paper:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }

    .paper[aria-disabled="true"]:hover {
        transform: translateY(-6%);
    }

    .paper.selected {
        box-shadow:
            0 0 0 2px var(--brass),
            0 10px 20px -6px rgb(0 0 0 / 0.6);
    }

    /* Behind newer papers only the spine shows; the front comes back when the paper is lifted out. */
    .paper.behind:not(:hover, :focus-visible) .sheet {
        opacity: 0;
    }

    .sheet {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
        transition: opacity 120ms;
        padding: calc(var(--u) * 0.07) 4px calc(var(--u) * 0.07) calc(var(--u) * 0.07);
        overflow: hidden;
    }

    /* The edge that stays in view when the paper stands behind newer ones. */
    .spine {
        display: flex;
        flex: none;
        align-items: center;
        gap: 4px;
        width: 22px;
        padding: 6px 0;
        writing-mode: vertical-rl;
        border-left: 1px solid color-mix(in oklch, var(--fp-ink) 25%, transparent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.06em;
        line-height: 22px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        color: var(--fp-ink-soft);
    }

    .paper-monthly {
        --band: var(--fp-am-ink);
    }

    .paper-collectors {
        --band: linear-gradient(
            115deg,
            var(--gold-deep) 0%,
            var(--gold) 30%,
            oklch(0.93 0.07 92) 45%,
            var(--gold) 60%,
            var(--gold-deep) 100%
        );
        --band-ink: var(--fp-ink);
    }

    /* The foil seal that marks a collector's copy. */
    .paper-collectors:not(.pile)::after {
        content: "";
        position: absolute;
        right: 28px;
        bottom: 22px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, oklch(0.95 0.06 92), var(--gold) 45%, var(--gold-deep));
        box-shadow: 0 0 0 1.5px color-mix(in oklch, var(--gold-deep) 60%, transparent);
    }

    .paper-year_end {
        --band: transparent;
        --band-ink: var(--gold);
        color: var(--gold);
        background-color: var(--year-black);
        background-image: linear-gradient(140deg, rgb(255 255 255 / 0.07), transparent 40%);
        outline: 1px solid var(--gold-deep);
        outline-offset: -3px;
    }

    .paper-year_end .bar {
        border-block: 1.5px solid var(--gold);
    }

    .paper-year_end .kind,
    .paper-year_end .spine {
        color: var(--gold);
    }

    .paper-year_end .rule {
        border-color: var(--gold);
    }

    /* Still on the press: a half-inked band and columns not set yet. */
    .paper-so_far {
        --band: repeating-linear-gradient(
            -45deg,
            var(--fp-spot) 0 5px,
            color-mix(in oklch, var(--fp-spot) 55%, var(--fp-paper)) 5px 8px
        );
    }

    .unset {
        flex: 1;
        margin-top: 2px;
        background: repeating-linear-gradient(
            to bottom,
            color-mix(in oklch, var(--fp-ink) 16%, transparent) 0 2px,
            transparent 2px 6px
        );
        mask-image: linear-gradient(to bottom, black, transparent);
    }

    .paper-so_far .rule {
        border-top-style: dashed;
    }

    .paper-so_far .foot {
        color: var(--fp-spot);
    }

    /* Not printed yet: a proof sheet waiting on the press. */
    .paper.printable {
        background-color: var(--fp-paper-edge);
        background-image: none;
        outline: 1px dashed color-mix(in oklch, var(--fp-ink) 45%, transparent);
        outline-offset: -4px;
    }

    .paper.printable .bar {
        background: none;
        color: var(--fp-ink-soft);
        box-shadow: inset 0 0 0 1px currentcolor;
    }

    .paper.printable .date,
    .paper.printable .kind {
        opacity: 0.7;
    }

    .paper-year_end.printable {
        background-color: color-mix(in oklch, var(--year-black) 70%, var(--background));
        outline-color: color-mix(in oklch, var(--gold) 50%, transparent);
    }

    .paper.too_few .sheet,
    .paper.too_few .spine {
        opacity: 0.4;
    }

    .paper.too_few {
        background-color: color-mix(in oklch, var(--fp-paper) 45%, var(--background));
        background-image: none;
    }

    /* Copies under the top one, peeking out above and behind it. */
    .pile {
        box-shadow:
            3px -3px 0 -1px var(--fp-paper-edge),
            3px -3px 0 0 rgb(0 0 0 / 0.25),
            6px -6px 0 -1px var(--fp-paper-edge),
            6px -6px 0 0 rgb(0 0 0 / 0.25),
            -6px 0 10px -6px rgb(0 0 0 / 0.55);
    }

    .count {
        writing-mode: horizontal-tb;
        min-width: 18px;
        border-radius: 999px;
        background: var(--brass);
        color: var(--background);
        font-family: var(--font-sans, sans-serif);
        font-size: 10px;
        line-height: 16px;
        text-align: center;
    }

    .bar {
        background: var(--band);
        color: var(--band-ink);
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: clamp(9px, calc(var(--u) * 0.15), 17px);
        line-height: 1.5;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
    }

    .kind {
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: clamp(7px, calc(var(--u) * 0.105), 12px);
        line-height: 1.15;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--fp-ink-soft);
    }

    .date {
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: clamp(9px, calc(var(--u) * 0.14), 16px);
        line-height: 1.15;
    }

    .rule {
        margin-top: auto;
        border-top: 1.5px solid var(--fp-ink);
    }

    .unset + .rule {
        margin-top: 3px;
    }

    .foot {
        display: flex;
        align-items: center;
        gap: 3px;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: clamp(8px, calc(var(--u) * 0.12), 13px);
        white-space: nowrap;
        text-transform: uppercase;
    }

    .new {
        position: absolute;
        top: -7px;
        right: -6px;
        padding: 1px 5px;
        border-radius: 999px;
        background: var(--brass);
        color: var(--background);
        font-size: 10px;
        font-weight: 700;
    }
</style>
