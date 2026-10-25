<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { EditionWindow } from "@deadlock-plus/stats/dispatch/types";
    import type { StandGroup, StandItem } from "../page-state";
    import { rackStop } from "../rack";
    import RackRow from "./rack-row.svelte";

    let {
        groups,
        selected,
        unseen,
        label,
        spine,
        pileLabel,
        onopen,
        onprint,
    }: {
        /** From `standGroups`: one rack row per group, newest first in each. */
        groups: readonly StandGroup[];
        selected: string | null;
        unseen: readonly string[];
        label: (window: EditionWindow) => string;
        spine: (window: EditionWindow) => string;
        pileLabel: (key: string) => string;
        onopen: (id: string) => void;
        /** Resolves once the printed edition is open, or the print gave up. */
        onprint: (window: EditionWindow) => Promise<void>;
    } = $props();

    let rack = $state<HTMLElement | null>(null);
    let printing = $state<string | null>(null);

    const all = $derived(groups.flatMap((g) => g.items));
    const focusId = $derived(all.find((i) => i.id === selected)?.id ?? all[0]?.id ?? null);

    async function choose(item: StandItem) {
        if (item.kind === "entry" && item.entry.status === "printable") {
            if (printing) return;
            printing = item.id;
            try {
                await onprint(item.entry.window);
            } finally {
                printing = null;
            }
        } else {
            onopen(item.id);
        }
    }

    // Added by hand: the papers are the buttons, the rack only routes arrow keys between them.
    $effect(() => {
        const el = rack;
        if (!el) return;
        const onkeydown = (e: KeyboardEvent) => {
            const from = (e.target as HTMLElement).closest<HTMLElement>("[data-rack-row]");
            if (!from) return;
            const counts = groups.map((_, r) => el.querySelectorAll(`[data-rack-row="${r}"]`).length);
            const pos = { row: Number(from.dataset.rackRow), col: Number(from.dataset.rackCol) };
            const to = rackStop(pos, e.key, counts);
            if (to === null) return;
            e.preventDefault();
            el.querySelector<HTMLElement>(`[data-rack-row="${to.row}"][data-rack-col="${to.col}"]`)?.focus();
        };
        el.addEventListener("keydown", onkeydown);
        return () => el.removeEventListener("keydown", onkeydown);
    });
</script>

<div bind:this={rack} class="rack" role="group" aria-label={t("dispatch.shelf.stand")}>
    {#each groups as group, r (group.id)}
        <section class="shelf" aria-labelledby="rack-{group.id}">
            <RackRow
                row={r}
                items={group.items}
                {selected}
                {focusId}
                {unseen}
                {printing}
                {label}
                {spine}
                {pileLabel}
                onchoose={choose}
            />
            <div class="ledge">
                <h3 id="rack-{group.id}" class="kicker">{t(`dispatch.shelf.group_${group.id}`)}</h3>
            </div>
        </section>
    {/each}
</div>

<style>
    .rack {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
    }

    .shelf {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        max-height: 240px;
        padding-top: 12px;
    }

    /* The stand's shelf: a lipped ledge the papers stand on, its label strip on the front edge. */
    .ledge {
        flex: none;
        margin: 0 -10px;
        padding: 2px 10px 1px;
        border-radius: 2px;
        background: linear-gradient(
            to bottom,
            color-mix(in oklch, var(--brass) 75%, white) 0 1px,
            color-mix(in oklch, var(--brass) 70%, black) 1px 3px,
            color-mix(in oklch, var(--brass) 45%, black) 3px 100%
        );
        box-shadow: 0 8px 14px -6px rgb(0 0 0 / 0.7);
    }

    .kicker {
        font-size: 10px;
        font-weight: 700;
        line-height: 14px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: color-mix(in oklch, var(--brass) 25%, white);
        text-shadow: 0 1px 0 rgb(0 0 0 / 0.5);
    }
</style>
