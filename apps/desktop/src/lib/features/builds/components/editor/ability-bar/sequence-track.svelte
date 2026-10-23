<script lang="ts">
    import { X } from "@lucide/svelte";
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { tick } from "svelte";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import { abilityTooltipAt, recommendedAfter, type TooltipHero } from "../../../ability-tooltip";
    import type { HeroKit } from "../../../build-detail.svelte";
    import { TIER_COSTS, type BlockReason, type OrderStep } from "../../../editor/ability-order";
    import { pastThreshold } from "../../../editor/drag.svelte";
    import { netWorthFor } from "../../../levels";
    import AbilityArt from "./ability-art.svelte";
    import AbilityHover from "./ability-hover.svelte";
    import TierPips from "./tier-pips.svelte";
    import { dragScroll, edgeSpeed, reveal, sidewaysWheel } from "./track-scroll";

    let {
        steps,
        kit,
        readonly = false,
        tooltips = new Map(),
        heroAt = () => ({}),
        total = 0,
        preview = null,
        alsoRemoves = () => [],
        check = () => null,
        onmove = () => false,
        onremove = () => {},
    }: {
        steps: readonly OrderStep[];
        kit: HeroKit;
        /** Shows the steps with a tooltip each and wraps; nothing moves or removes. Editing keeps one scrolling row. */
        readonly?: boolean;
        /** The game's ability tooltips by ability id, for the read-only steps' hovers. */
        tooltips?: ReadonlyMap<number, AbilityTooltip>;
        /** The hero when the build reaches step `index`, for the read-only steps' hovers. */
        heroAt?: (index: number) => TooltipHero;
        /** Every step a full order has; the ones not taken yet show as empty slots. */
        total?: number;
        /** The step a click on an ability would add, drawn in the first empty slot. */
        preview?: OrderStep | null;
        /** 1-based numbers of the other steps removing `index` takes with it. */
        alsoRemoves?: (index: number) => number[];
        /** Why moving `from` to end up at `to` is refused, or null when it is allowed. */
        check?: (from: number, to: number) => BlockReason | null;
        /** `to` is the index the step ends up at; false when the move was refused. */
        onmove?: (from: number, to: number) => boolean;
        onremove?: (index: number) => void;
    } = $props();

    const SHIFT = 4;

    let list = $state<HTMLOListElement>();
    let dragging = $state<{ from: number; insert: number; row: number; x: number; y: number } | null>(null);
    let rows: number[] = [];
    let press: { from: number; x: number; y: number; pointer: number } | null = null;
    let doomed = $state<ReadonlySet<number>>(new Set());

    const kindText = (step: OrderStep) =>
        step.tier === 0 ? t("builds.editor.abilities.unlock") : t("builds.editor.abilities.tier", { tier: step.tier });

    const chipLabel = (step: OrderStep, i: number) =>
        t("builds.editor.abilities.chip_label", {
            step: i + 1,
            ability: kit.abilities.get(step.abilityId)?.name ?? "?",
            kind: kindText(step),
        });

    function removeHint(i: number): string {
        const line = t("builds.editor.abilities.remove_hint", { step: i + 1 });
        const others = alsoRemoves(i);
        if (others.length === 0) return line;
        return `${line} ${tn("builds.editor.abilities.also_removes", others.length, { steps: others.map((n) => `#${n}`).join(", ") })}`;
    }

    function levelLine(step: OrderStep): string {
        if (step.level === null) return t("builds.editor.abilities.step_level_unknown");
        const reached = kit.levels.find((l) => l.level === step.level);
        return reached
            ? t("builds.editor.abilities.step_level", {
                  level: step.level,
                  souls: formatNumber(netWorthFor(reached.souls)),
              })
            : t("builds.editor.abilities.level", { level: step.level });
    }

    function stepTooltip(step: OrderStep, i: number) {
        const tooltip = tooltips.get(step.abilityId);
        return tooltip ? abilityTooltipAt(tooltip, step.tier, recommendedAfter(steps, i), heroAt(i)) : null;
    }

    const costLine = (step: OrderStep) =>
        step.tier === 0
            ? t("builds.editor.abilities.cost_unlock")
            : t("builds.editor.abilities.cost_points", { points: TIER_COSTS[step.tier - 1]! });

    /** Calls the tooltip trigger's own handler that a handler of ours replaces. */
    const forward = (handler: unknown, event: Event) =>
        typeof handler === "function" ? (handler as (event: Event) => void)(event) : undefined;

    const chips = () => [...(list?.querySelectorAll<HTMLElement>("[data-step-chip]") ?? [])];

    /** Insertion index before removal, and the row (by top edge) the pointer is on. */
    function insertionAt(x: number, y: number): { insert: number; row: number } {
        const rects = chips().map((el) => el.getBoundingClientRect());
        const first = rects.findIndex((r) => y < r.bottom);
        if (first < 0) return { insert: rects.length, row: rows.at(-1) ?? 0 };
        const row = rows[first]!;
        let i = first;
        while (i < rects.length && rows[i] === row && x >= rects[i]!.left + rects[i]!.width / 2) i++;
        return { insert: i, row };
    }

    const to = (from: number, insert: number) => (insert > from ? insert - 1 : insert);
    const noop = $derived(
        dragging !== null && (dragging.insert === dragging.from || dragging.insert === dragging.from + 1),
    );
    const refused = $derived(dragging && !noop ? check(dragging.from, to(dragging.from, dragging.insert)) : null);

    /** The caret sits before the insertion chip on the pointer's row, else after the chip before it. */
    function caret(i: number): "before" | "after" | null {
        if (!dragging || noop) return null;
        const { insert, row } = dragging;
        if (insert === i && rows[i] === row) return "before";
        if (insert === i + 1 && rows[i] === row && rows[i + 1] !== row) return "after";
        return null;
    }

    function shift(i: number): number {
        if (!dragging || noop || rows[i] !== dragging.row) return 0;
        return i < dragging.insert ? -SHIFT : SHIFT;
    }

    async function focusChip(index: number) {
        await tick();
        chips()[index]?.focus();
    }

    function move(from: number, target: number) {
        if (target < 0 || target >= steps.length || from === target) return;
        if (onmove(from, target)) void focusChip(target);
    }

    function pointerdown(event: PointerEvent, from: number) {
        if (event.button !== 0) return;
        press = { from, x: event.clientX, y: event.clientY, pointer: event.pointerId };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function pointermove(event: PointerEvent) {
        if (!press || event.pointerId !== press.pointer) return;
        if (!dragging && !pastThreshold(press, { x: event.clientX, y: event.clientY })) return;
        if (!dragging) rows = chips().map((el) => Math.round(el.getBoundingClientRect().top));
        dragging = {
            from: press.from,
            ...insertionAt(event.clientX, event.clientY),
            x: event.clientX,
            y: event.clientY,
        };
        if (!readonly && !frame) autoScroll();
    }

    let frame = 0;

    const padding = () => (list ? parseFloat(getComputedStyle(list).paddingLeft) || 0 : 0);

    /** Scrolls while a drag holds near an edge, even when the pointer stops moving. */
    function autoScroll() {
        frame = 0;
        if (!dragging || !list) return;
        const before = list.scrollLeft;
        const firstEmpty = (list.children[steps.length] ?? list.lastElementChild) as HTMLElement | null;
        const end = firstEmpty ? firstEmpty.offsetLeft + firstEmpty.offsetWidth + padding() : list.scrollWidth;
        const view = { scrollLeft: before, width: list.clientWidth };
        list.scrollLeft = dragScroll(view, edgeSpeed(dragging.x, list.getBoundingClientRect()), end);
        if (Math.round(list.scrollLeft) === Math.round(before)) return;
        dragging = { ...dragging, ...insertionAt(dragging.x, dragging.y) };
        frame = requestAnimationFrame(autoScroll);
    }

    function wheel(event: WheelEvent) {
        if (!list) return;
        const delta = sidewaysWheel(event, list.clientWidth);
        const max = list.scrollWidth - list.clientWidth;
        if (max <= 0 || (delta < 0 && list.scrollLeft <= 0) || (delta > 0 && list.scrollLeft >= max)) return;
        event.preventDefault();
        list.scrollLeft += delta;
    }

    let seen: number | null = null;

    $effect(() => {
        const count = steps.length;
        const grew = seen !== null && count > seen;
        seen = count;
        if (readonly || !grew || !list) return;
        const newest = list.children[count - 1] as HTMLElement | undefined;
        const after = (list.children[count] as HTMLElement | undefined) ?? newest;
        if (!newest || !after) return;
        list.scrollLeft = reveal(
            { scrollLeft: list.scrollLeft, width: list.clientWidth },
            newest.offsetLeft - padding(),
            after.offsetLeft + after.offsetWidth + padding(),
        );
    });

    function pointerup(event: PointerEvent) {
        if (!press || event.pointerId !== press.pointer) return;
        const drop = dragging;
        cancel();
        if (drop) move(drop.from, to(drop.from, drop.insert));
    }

    function cancel() {
        press = null;
        dragging = null;
        cancelAnimationFrame(frame);
        frame = 0;
    }

    function keydown(event: KeyboardEvent, i: number) {
        if (event.key === "Escape" && dragging) {
            event.preventDefault();
            cancel();
        } else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            move(i, event.key === "ArrowLeft" ? i - 1 : i + 1);
        } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            onremove(i);
        }
    }

    const dragged = $derived(dragging ? steps[dragging.from] : undefined);

    // Unlocks and points are two queues the game runs side by side, so a step can come at a lower level than one
    // stored before it; its level stands out so the out-of-sequence timing reads.
    const earlier = $derived(
        steps.map((step, i) => {
            const level = step.level;
            return level !== null && steps.slice(0, i).some((s) => s.level !== null && s.level > level);
        }),
    );
</script>

{#snippet face(step: OrderStep)}
    <AbilityArt ability={kit.abilities.get(step.abilityId)} class="size-6" />
    {#if step.tier === 0}
        <span class="text-[8px] leading-none font-bold tracking-wide text-brass uppercase">
            {t("builds.editor.abilities.unlock_short")}
        </span>
    {:else}
        <TierPips taken={step.tier} />
    {/if}
{/snippet}

{#snippet levelLabel(step: OrderStep, i: number)}
    <span
        class={cn(
            "h-3 text-[10px] leading-3 tabular-nums",
            earlier[i] ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
    >
        {#if step.level !== null}{t("builds.editor.abilities.level", { level: step.level })}{/if}
    </span>
{/snippet}

{#snippet readonlyChip(step: OrderStep, i: number)}
    <li class="flex w-12 flex-col items-center gap-0.5">
        <Tooltip.Root delayDuration={150}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <span
                        {...props}
                        role="img"
                        aria-label={chipLabel(step, i)}
                        data-step-chip
                        class={cn(
                            "relative flex h-[50px] w-12 flex-col items-center justify-end gap-1 rounded-md border pb-1.5 transition-colors",
                            step.tier === 0
                                ? "border-brass/45 bg-brass/10 hover:border-brass/80"
                                : "border-border bg-muted/30 hover:border-brass/50",
                            step.abilityId === kit.ultimateId && "border-brass/70",
                        )}
                    >
                        <span
                            class="absolute top-0.5 left-1 text-[9px] leading-none text-muted-foreground tabular-nums"
                        >
                            {i + 1}
                        </span>
                        {@render face(step)}
                    </span>
                {/snippet}
            </Tooltip.Trigger>
            <AbilityHover model={stepTooltip(step, i)} name={kit.abilities.get(step.abilityId)?.name ?? "?"}>
                <p>{t("builds.editor.abilities.step_kind", { step: i + 1, kind: kindText(step) })}</p>
                <p>{levelLine(step)}</p>
                <p class="text-muted-foreground">{costLine(step)}</p>
            </AbilityHover>
        </Tooltip.Root>
        {@render levelLabel(step, i)}
    </li>
{/snippet}

{#snippet caretBar(side: "before" | "after")}
    <span
        class={cn(
            "pointer-events-none absolute top-0 z-10 flex h-[50px] w-[3px] flex-col items-center justify-between",
            side === "before" ? "-left-[5px]" : "-right-[5px]",
        )}
        aria-hidden="true"
    >
        <span class={cn("h-0.5 w-2.5 rounded-full", refused ? "bg-destructive" : "bg-brass")}></span>
        <span class={cn("w-[3px] flex-1 rounded-full", refused ? "bg-destructive" : "bg-brass")}></span>
        <span class={cn("h-0.5 w-2.5 rounded-full", refused ? "bg-destructive" : "bg-brass")}></span>
    </span>
{/snippet}

<Tooltip.Provider>
    <!-- Editing keeps one row so the bar never grows over the canvas; the padding keeps the remove
         buttons, carets and focus rings inside the scroll box's clip. -->
    <ol
        bind:this={list}
        class={readonly
            ? "flex flex-wrap content-start gap-x-1.5 gap-y-1.5"
            : cn(
                  "relative -mx-1.5 -mt-1.5 flex h-[78px] shrink-0 gap-x-1.5 overflow-x-auto overflow-y-hidden px-1.5 pt-1.5",
                  "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:border-0",
              )}
        aria-label={t("builds.editor.abilities.sequence")}
        data-testid="ability-sequence"
        onwheel={readonly ? undefined : wheel}
    >
        {#each steps as step, i (i)}
            {#if readonly}
                {@render readonlyChip(step, i)}
            {:else}
                {@const side = caret(i)}
                <li
                    class="relative flex w-12 shrink-0 flex-col items-center gap-0.5 transition-transform duration-100"
                    style:transform={shift(i) ? `translateX(${shift(i)}px)` : undefined}
                >
                    {#if side}{@render caretBar(side)}{/if}
                    <div class="group relative">
                        <Button
                            variant="unstyled"
                            data-step-chip
                            aria-label={chipLabel(step, i)}
                            onpointerdown={(e: PointerEvent) => pointerdown(e, i)}
                            onpointermove={pointermove}
                            onpointerup={pointerup}
                            onpointercancel={cancel}
                            onlostpointercapture={cancel}
                            onkeydown={(e: KeyboardEvent) => keydown(e, i)}
                            class={cn(
                                "relative flex h-[50px] w-12 cursor-grab touch-none flex-col items-center justify-end gap-1 rounded-md border pb-1.5 transition-[border-color,background-color,opacity] select-none",
                                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                                step.tier === 0
                                    ? "border-brass/45 bg-brass/10 hover:border-brass/80"
                                    : "border-border bg-muted/30 hover:border-brass/50",
                                step.abilityId === kit.ultimateId && "border-brass/70",
                                doomed.has(i) && "border-destructive/70 bg-destructive/15",
                                dragging?.from === i && "opacity-35",
                            )}
                        >
                            <span
                                class="absolute top-0.5 left-1 text-[9px] leading-none text-muted-foreground tabular-nums"
                            >
                                {i + 1}
                            </span>
                            {@render face(step)}
                        </Button>
                        {#if !dragging}
                            <Tooltip.Root delayDuration={300}>
                                <Tooltip.Trigger>
                                    {#snippet child({ props })}
                                        <Button
                                            {...props}
                                            variant="unstyled"
                                            aria-label={t("builds.editor.abilities.remove_step", { step: i + 1 })}
                                            onpointerenter={(event: PointerEvent) => {
                                                forward(props.onpointerenter, event);
                                                doomed = new Set([i, ...alsoRemoves(i).map((n) => n - 1)]);
                                            }}
                                            onpointerleave={(event: PointerEvent) => {
                                                forward(props.onpointerleave, event);
                                                doomed = new Set();
                                            }}
                                            onclick={(event: MouseEvent) => {
                                                forward(props.onclick, event);
                                                doomed = new Set();
                                                onremove(i);
                                            }}
                                            class="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100"
                                        >
                                            <X class="size-2.5" />
                                        </Button>
                                    {/snippet}
                                </Tooltip.Trigger>
                                <Tooltip.Content side="top">{removeHint(i)}</Tooltip.Content>
                            </Tooltip.Root>
                        {/if}
                    </div>
                    {@render levelLabel(step, i)}
                </li>
            {/if}
        {/each}
        {#each { length: readonly ? 0 : Math.max(0, total - steps.length) } as _, k (k)}
            {@const n = steps.length + k}
            {@const shown = k === 0 ? preview : null}
            <li class="flex w-12 shrink-0 flex-col items-center gap-0.5" aria-hidden="true">
                <span
                    class={cn(
                        "relative flex h-[50px] w-12 flex-col items-center justify-end gap-1 rounded-md border border-dashed pb-1.5",
                        shown ? "border-brass/70 bg-brass/5 [&>*]:opacity-70" : "border-border/60",
                    )}
                >
                    <span class="absolute top-0.5 left-1 text-[9px] leading-none text-muted-foreground/50 tabular-nums">
                        {n + 1}
                    </span>
                    {#if shown}{@render face(shown)}{/if}
                </span>
                <span class="h-3 text-[10px] leading-3 text-brass/80 tabular-nums">
                    {#if shown?.level != null}{t("builds.editor.abilities.level", { level: shown.level })}{/if}
                </span>
            </li>
        {/each}
    </ol>
</Tooltip.Provider>

{#if dragging && dragged}
    <div
        class="pointer-events-none fixed z-(--z-popover) translate-x-3 translate-y-3"
        style:left="{dragging.x}px"
        style:top="{dragging.y}px"
        aria-hidden="true"
    >
        <span
            class={cn(
                "flex h-[50px] w-12 flex-col items-center justify-end gap-1 rounded-md border bg-card pb-1.5 shadow-lg",
                refused ? "border-destructive" : "border-brass",
            )}
        >
            {@render face(dragged)}
        </span>
        {#if refused}
            <span
                class="absolute top-1/2 left-full ml-2 -translate-y-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap text-warning shadow-md"
            >
                {t(`builds.editor.abilities.reason_${refused}`)}
            </span>
        {/if}
    </div>
{/if}
