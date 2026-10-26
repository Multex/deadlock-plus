<script lang="ts">
    import { tick } from "svelte";
    import { X } from "@lucide/svelte";
    import Button, { unstyledButtonClass } from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import CollectorsMini from "../kinds/collectors/collectors-mini.svelte";
    import { miniAria, miniFormat, miniMonth, type MiniCopy, type MiniCover } from "../kinds/minis";
    import MonthlyMini from "../kinds/monthly/monthly-mini.svelte";
    import { MONTH_PALETTES } from "../kinds/monthly/palette";
    import SoFarMini from "../kinds/weekly/so-far-mini.svelte";
    import WeeklyMini from "../kinds/weekly/weekly-mini.svelte";
    import YearEndMini from "../kinds/year_end/year-end-mini.svelte";
    import {
        bundleAria,
        bundleName,
        columnText,
        ratio,
        slipText,
        spineText,
        spreadLayout,
        tableLayout,
        tablePiles,
        type TableBundle,
        type TableCopies,
    } from "./table";

    let {
        copies,
        covers,
        width,
        height,
        open = $bindable(null),
        onpick,
        onprint,
        onbundle,
    }: {
        copies: TableCopies;
        covers: Record<string, MiniCover>;
        /** Fixed table size in px; measured from the element when left out. */
        width?: number;
        height?: number;
        /** Key of the bundle dealt out on the table, or `null`. */
        open?: string | null;
        /** An issued or still-printing copy was picked up; `from` is where its cover sits on screen. */
        onpick: (copy: MiniCopy, from: DOMRect) => void;
        /** A proof was clicked: print it, then open it from `from`. */
        onprint: (copy: MiniCopy, from: DOMRect) => void;
        onbundle?: (key: string | null) => void;
    } = $props();

    let measuredW = $state(0);
    let measuredH = $state(0);
    let spreadEl = $state<HTMLElement | null>(null);
    let sceneEl = $state<HTMLElement | null>(null);

    const w = $derived(width ?? measuredW);
    const h = $derived(height ?? measuredH);
    const fmt = $derived(miniFormat());
    const piles = $derived(tablePiles(copies));
    const L = $derived(w > 0 && h > 0 ? tableLayout(piles, w, h) : null);
    const bundles = $derived([...piles.weekly, ...piles.monthlyYears]);
    const spread = $derived(bundles.find((b) => b.key === open) ?? null);
    const S = $derived(spread && w > 0 ? spreadLayout(spread, w, h) : null);

    const palOf = (c: MiniCopy) => MONTH_PALETTES[miniMonth(c.window)];

    function setOpen(key: string | null) {
        const was = open;
        open = key;
        onbundle?.(key);
        void tick().then(() => {
            if (key !== null) spreadEl?.querySelector<HTMLElement>("[data-copy]")?.focus();
            else if (was !== null) sceneEl?.querySelector<HTMLElement>(`[data-bundle="${was}"]`)?.focus();
        });
    }

    function rectOf(e: MouseEvent) {
        const el = e.currentTarget as HTMLElement;
        return (el.querySelector<HTMLElement>("[data-mini]") ?? el).getBoundingClientRect();
    }

    function pick(c: MiniCopy, from: DOMRect) {
        if (c.state === "too_few") return;
        if (open !== null) setOpen(null);
        if (c.state === "proof") onprint(c, from);
        else onpick(c, from);
    }

    /** A spine grows into the cover it belongs to, centred on where it was pulled from. */
    function spineRect(e: MouseEvent) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ch = r.width / ratio("monthly");
        return new DOMRect(r.left, r.top + r.height / 2 - ch / 2, r.width, ch);
    }

    $effect(() => {
        if (open === null) return;
        const onkey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            setOpen(null);
        };
        window.addEventListener("keydown", onkey, true);
        return () => window.removeEventListener("keydown", onkey, true);
    });
</script>

{#snippet mini(c: MiniCopy, size: number)}
    {#if c.kind === "so_far"}
        <SoFarMini copy={c} height={size} />
    {:else if c.kind === "weekly"}
        <WeeklyMini copy={c} cover={covers[c.id]} height={size} />
    {:else if c.kind === "monthly"}
        <MonthlyMini copy={c} cover={covers[c.id]} height={size} />
    {:else if c.kind === "collectors"}
        <CollectorsMini copy={c} cover={covers[c.id]} height={size} sealed={c.isNew} />
    {:else}
        <YearEndMini copy={c} cover={covers[c.id]} height={size} />
    {/if}
{/snippet}

{#snippet item(c: MiniCopy, size: number, x: number, y: number, rot: number, z: number)}
    <button
        type="button"
        class="{unstyledButtonClass} obj"
        style="left: {x}px; top: {y}px; --rot: {rot}deg; z-index: {z};"
        aria-label={miniAria(c, fmt)}
        aria-disabled={c.state === "too_few" ? "true" : undefined}
        data-copy={c.id}
        onclick={(e) => pick(c, rectOf(e))}
    >
        {@render mini(c, size)}
    </button>
{/snippet}

{#snippet tag(b: TableBundle, top: number, font: number, line: number)}
    <span class="tag" style="top: {top}px; font-size: {font}px; line-height: {line}px;" aria-hidden="true"
        >{slipText(b, fmt)}</span
    >
{/snippet}

<div class="frame" data-table>
    <div class="leather" bind:clientWidth={measuredW} bind:clientHeight={measuredH}>
        {#if L}
            <div
                class="scene"
                bind:this={sceneEl}
                inert={spread !== null}
                role="group"
                aria-label={t("dispatch.shelf.stand")}
            >
                {#if L.weekly && piles.topWeekly}
                    {@const W = L.weekly}
                    <div class="stack" style="left: {W.x}px; top: {W.y}px; width: {W.w}px;">
                        <div class="edges" style="top: {W.coverH - 2}px; height: {W.edgesH + 4}px;">
                            {#each W.bands as b (b.bundle.key)}
                                {@const pal = palOf(b.bundle.copies[0])}
                                <button
                                    type="button"
                                    class="{unstyledButtonClass} band"
                                    class:left={b.left}
                                    style="top: {b.top}px; height: {b.h}px; --dx: {b.dx}px;"
                                    aria-label={bundleAria(b.bundle, fmt)}
                                    aria-expanded={open === b.bundle.key}
                                    data-bundle={b.bundle.key}
                                    onclick={() => setOpen(b.bundle.key)}
                                >
                                    {#each b.sheets as sh (sh.copy.id)}
                                        <span
                                            class="sheet {sh.copy.state}"
                                            style="height: {W.sheet}px; --sx: {sh.sx}px;"
                                        ></span>
                                    {/each}
                                    {#if b.bundle.month === null}<span class="twine" aria-hidden="true"></span>{/if}
                                    <span
                                        class="slip"
                                        class:kraft={b.bundle.month === null}
                                        style="top: {b.slip.top}px; height: {b.slip.h}px; font-size: {b.slip
                                            .font}px; --bg: {pal.bg}; --fg: {pal.fg}; --tilt: {b.slip.tilt}deg;"
                                        >{slipText(b.bundle, fmt)}</span
                                    >
                                </button>
                            {/each}
                        </div>
                        {@render item(piles.topWeekly, W.coverH, 0, 0, -1.5, 2)}
                    </div>
                {/if}

                {#if L.soFar}
                    {@render item(L.soFar.copy, L.soFar.h, L.soFar.x, L.soFar.y, L.soFar.rot, L.soFar.z)}
                {/if}

                {#each L.specials as sp (sp.copy.id)}
                    {@render item(sp.copy, sp.h, sp.x, sp.y, sp.rot, sp.z)}
                {/each}

                {#if L.monthly && piles.topMonthly}
                    {@const M = L.monthly}
                    <div class="stack" style="left: {M.x}px; top: {M.y}px; width: {M.w}px;">
                        <div class="spines" style="top: {M.coverH - 1}px;">
                            {#each M.rows as row (row.type === "spine" ? row.copy.id : row.bundle.key)}
                                {#if row.type === "spine"}
                                    {@const pal = palOf(row.copy)}
                                    {@const text = spineText(row.copy, fmt)}
                                    <button
                                        type="button"
                                        class="{unstyledButtonClass} spine"
                                        class:proof={row.copy.state !== "issued"}
                                        class:faded={row.copy.state === "too_few"}
                                        style="top: {row.top}px; height: {row.h}px; font-size: {row.font}px; --bg: {pal.bg}; --fg: {pal.fg}; --ink: {pal.ink}; --dx: {row.dx}px;"
                                        aria-label={miniAria(row.copy, fmt)}
                                        aria-disabled={row.copy.state === "too_few" ? "true" : undefined}
                                        data-copy={row.copy.id}
                                        onclick={(e) => pick(row.copy, spineRect(e))}
                                    >
                                        <span class="sp-name">{text.name}</span>
                                        <span class="sp-no">{text.no}</span>
                                    </button>
                                {:else}
                                    <button
                                        type="button"
                                        class="{unstyledButtonClass} block"
                                        style="top: {row.top}px; height: {row.h}px;"
                                        aria-label={bundleAria(row.bundle, fmt)}
                                        aria-expanded={open === row.bundle.key}
                                        data-bundle={row.bundle.key}
                                        onclick={() => setOpen(row.bundle.key)}
                                    >
                                        {#each row.bundle.copies as c (c.id)}
                                            <span
                                                class="strip"
                                                class:proof={c.state !== "issued"}
                                                style="height: {row.sheet}px; --bg: {palOf(c).bg};"
                                            ></span>
                                        {/each}
                                        <span class="twine tie-twine" aria-hidden="true"></span>
                                        {@render tag(row.bundle, row.h / 2 - M.tag.line / 2, M.tag.font, M.tag.line)}
                                    </button>
                                {/if}
                            {/each}
                            {#each M.ties as tie (tie.bundle.key)}
                                <span
                                    class="tie"
                                    style="top: {tie.top - 3}px; height: {tie.h + 6}px;"
                                    aria-hidden="true"
                                ></span>
                                {@render tag(tie.bundle, tie.top + tie.h / 2 - M.tag.line / 2, M.tag.font, M.tag.line)}
                            {/each}
                        </div>
                        {@render item(piles.topMonthly, M.coverH, 0, 0, -1, 2)}
                    </div>
                {/if}
            </div>

            {#if spread && S}
                <button
                    type="button"
                    class="{unstyledButtonClass} scrim"
                    aria-label={t("dispatch.table.gather")}
                    tabindex="-1"
                    onclick={() => setOpen(null)}
                ></button>
                <div class="spread" bind:this={spreadEl} role="group" aria-label={bundleName(spread, fmt)} data-spread>
                    <div class="spread-head" style="top: {16 * S.u}px; right: {22 * S.u}px; left: {28 * S.u}px;">
                        <span class="spread-title" style="font-size: {S.titleFont}px;">{bundleName(spread, fmt)}</span>
                        <Button variant="ghost" size="sm" onclick={() => setOpen(null)}>
                            <X aria-hidden="true" />{t("dispatch.table.close")}<kbd class="kbd">Esc</kbd>
                        </Button>
                    </div>
                    {#each S.labels as l (l.window.id)}
                        {@const pal = palOf(spread.copies.find((c) => c.window.id === l.window.id)!)}
                        <span
                            class="col-slip"
                            style="left: {l.x}px; top: {l.y}px; width: {l.width}px; height: {l.h}px; line-height: {l.h}px; font-size: {l.font}px; padding: 0 {l.font *
                                0.85}px; --bg: {pal.bg}; --fg: {pal.fg};">{columnText(l.window, l.count, fmt)}</span
                        >
                    {/each}
                    {#each S.items as it, j (it.copy.id)}
                        <div class="laid" style="left: {it.x}px; top: {it.y}px; z-index: {it.z + 1}; --i: {j};">
                            {@render item(it.copy, S.ih, 0, 0, it.rot, 1)}
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    /* Walnut, with the front apron drawn a little deeper than the far rim. */
    .frame {
        position: relative;
        height: 100%;
        padding: 14px 14px 22px;
        border-radius: 22px;
        background:
            linear-gradient(
                to bottom,
                transparent calc(100% - 26px),
                rgb(0 0 0 / 0.38) calc(100% - 20px),
                rgb(0 0 0 / 0.55)
            ),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.004 0.09' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.06 0 0 0 0 0.02 0 0 0 1.1 -0.35'/%3E%3C/filter%3E%3Crect width='600' height='240' filter='url(%23g)'/%3E%3C/svg%3E"),
            linear-gradient(to bottom, oklch(0.4 0.065 48), oklch(0.31 0.055 42));
        background-size:
            auto,
            600px 240px,
            auto;
        box-shadow:
            inset 0 1px 0 oklch(0.55 0.07 55 / 0.7),
            inset 0 -2px 0 oklch(0.2 0.03 40),
            0 26px 40px -12px rgb(0 0 0 / 0.75),
            0 4px 10px rgb(0 0 0 / 0.4);
    }

    /* Green leather, tooled in gold. */
    .leather {
        position: relative;
        height: 100%;
        border-radius: 10px;
        background:
            radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.32)),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 -0.1'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)'/%3E%3C/svg%3E"),
            linear-gradient(160deg, oklch(0.36 0.055 162), oklch(0.27 0.045 165));
        box-shadow:
            inset 0 0 0 1px rgb(0 0 0 / 0.6),
            inset 0 3px 8px rgb(0 0 0 / 0.5);
    }

    .leather::before,
    .leather::after {
        content: "";
        position: absolute;
        border-radius: 6px;
        pointer-events: none;
    }

    .leather::before {
        inset: 9px;
        border: 1.5px solid oklch(0.72 0.1 82 / 0.55);
    }

    .leather::after {
        inset: 14px;
        border: 1px solid oklch(0.72 0.1 82 / 0.3);
    }

    .scene {
        position: absolute;
        inset: 0;
    }

    .stack {
        position: absolute;
    }

    .obj {
        position: absolute;
        display: block;
        transform: rotate(var(--rot));
        filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.5)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.4));
        transition: transform 160ms;
    }

    .obj:hover,
    .obj:focus-visible {
        transform: rotate(calc(var(--rot) * 0.4)) translateY(-8px) scale(1.025);
    }

    .obj:focus-visible,
    .band:focus-visible,
    .spine:focus-visible,
    .block:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 3px;
    }

    .obj[aria-disabled="true"],
    .spine[aria-disabled="true"] {
        cursor: default;
    }

    /* The weeklies' folded edges under the top copy, one bundle per month. */
    .edges {
        position: absolute;
        right: 0;
        left: 0;
        filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.5));
    }

    .band {
        position: absolute;
        right: 0;
        left: 0;
        display: flex;
        flex-direction: column;
        transform: translateX(var(--dx));
        transition: transform 140ms;
    }

    .band:hover,
    .band:focus-visible {
        transform: translateX(calc(var(--dx) + 4px));
    }

    .band.left:hover,
    .band.left:focus-visible {
        transform: translateX(calc(var(--dx) - 4px));
    }

    .sheet {
        display: block;
        flex: none;
        margin-left: var(--sx);
        margin-right: calc(var(--sx) * -1);
        background: linear-gradient(to bottom, oklch(0.93 0.025 88), oklch(0.82 0.035 84));
        box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.35);
    }

    .sheet.proof {
        background: linear-gradient(to bottom, oklch(0.86 0.02 86), oklch(0.74 0.025 82));
    }

    .sheet.too_few {
        background: linear-gradient(to bottom, oklch(0.6 0.01 80), oklch(0.5 0.01 80));
    }

    .twine {
        position: absolute;
        top: -3px;
        bottom: -3px;
        left: 34%;
        width: 4px;
        background: repeating-linear-gradient(to bottom, oklch(0.66 0.07 72) 0 3px, oklch(0.5 0.06 66) 3px 6px);
        box-shadow: 0 0 2px rgb(0 0 0 / 0.6);
    }

    .twine.tie-twine {
        left: 72%;
    }

    /* A divider slip between bundles, its month's cover colour, alternating sides. */
    .slip {
        position: absolute;
        right: calc(100% - 10px);
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 56px;
        padding: 0 16px 0 7px;
        border-radius: 3px 0 0 3px;
        background: var(--bg);
        color: var(--fg);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        letter-spacing: 0.08em;
        white-space: nowrap;
        text-transform: uppercase;
        transform: rotate(var(--tilt));
        box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.18),
            0 2px 4px rgb(0 0 0 / 0.45);
        z-index: -1;
    }

    .band:not(.left) .slip {
        right: auto;
        left: calc(100% - 10px);
        padding: 0 7px 0 16px;
        border-radius: 0 3px 3px 0;
    }

    .slip.kraft {
        background: linear-gradient(to bottom, oklch(0.72 0.07 72), oklch(0.62 0.07 68));
        color: oklch(0.22 0.03 60);
    }

    /* The monthlies' spines under the newest cover. */
    .spines {
        position: absolute;
        right: 0;
        left: 0;
        filter: drop-shadow(0 10px 10px rgb(0 0 0 / 0.5));
    }

    .spine,
    .block {
        position: absolute;
        right: 0;
        left: 0;
    }

    .spine {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 9px;
        background: var(--bg);
        color: var(--fg);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.1em;
        white-space: nowrap;
        overflow: hidden;
        transform: translateX(var(--dx));
        box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.22),
            inset 0 -1px 0 rgb(0 0 0 / 0.4),
            inset 4px 0 0 rgb(0 0 0 / 0.18);
        transition: transform 140ms;
    }

    .spine.proof {
        background: oklch(0.95 0.008 85);
        color: var(--ink);
        box-shadow:
            inset 0 -1px 0 rgb(0 0 0 / 0.35),
            inset 4px 0 0 color-mix(in oklch, var(--ink) 30%, transparent);
    }

    .spine.faded {
        filter: grayscale(0.85) brightness(0.55) contrast(0.9);
    }

    .spine:hover,
    .spine:focus-visible {
        transform: translateX(calc(var(--dx) - 12px));
    }

    .sp-no {
        opacity: 0.8;
    }

    /* An older year folded flat: its covers' edges, tied and tagged. */
    .block {
        display: flex;
        flex-direction: column;
        transition: transform 140ms;
    }

    .block:hover,
    .block:focus-visible {
        transform: translateX(-6px);
    }

    .strip {
        display: block;
        flex: none;
        background: var(--bg);
        box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.4);
    }

    .strip.proof {
        background: oklch(0.95 0.008 85);
    }

    .tie {
        position: absolute;
        left: 72%;
        width: 4px;
        background: repeating-linear-gradient(to bottom, oklch(0.66 0.07 72) 0 3px, oklch(0.5 0.06 66) 3px 6px);
        box-shadow: 0 0 2px rgb(0 0 0 / 0.6);
        pointer-events: none;
    }

    .tag {
        position: absolute;
        left: 100%;
        margin-left: -6px;
        padding: 0 8px 0 10px;
        border-radius: 0 3px 3px 0;
        background: linear-gradient(to bottom, oklch(0.72 0.07 72), oklch(0.62 0.07 68));
        color: oklch(0.22 0.03 60);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        letter-spacing: 0.08em;
        white-space: nowrap;
        text-transform: uppercase;
        transform: rotate(-4deg);
        box-shadow: 0 2px 4px rgb(0 0 0 / 0.45);
        pointer-events: none;
    }

    .scrim {
        position: absolute;
        inset: 0;
        z-index: 40;
        border-radius: 10px;
        background: rgb(0 0 0 / 0.55);
        backdrop-filter: blur(2px);
    }

    .spread {
        position: absolute;
        inset: 0;
        z-index: 41;
        pointer-events: none;
    }

    .spread > * {
        pointer-events: auto;
    }

    .spread-head {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .spread-title {
        font-family: "Valve Pulp", sans-serif;
        color: oklch(0.92 0.03 86);
        text-shadow: 0 2px 4px rgb(0 0 0 / 0.6);
    }

    .laid {
        position: absolute;
        animation: deal 260ms calc(var(--i) * 18ms) cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
    }

    .laid > :global(.obj) {
        position: relative;
    }

    .col-slip {
        position: absolute;
        border-radius: 3px;
        background: var(--bg);
        color: var(--fg);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.18),
            0 2px 4px rgb(0 0 0 / 0.45);
    }

    @keyframes deal {
        from {
            opacity: 0;
            transform: translateY(30px) scale(0.92);
        }
    }

    .kbd {
        margin-left: 4px;
        padding: 0 5px;
        border: 1px solid var(--border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 11px;
        line-height: 16px;
        color: var(--muted-foreground);
    }

    @media (prefers-reduced-motion: reduce) {
        .laid {
            animation: none;
        }
    }
</style>
