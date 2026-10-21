<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import { tick } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "../../../build-detail.svelte";
    import { TIER_COSTS, type OrderStep } from "../../../editor/ability-order";
    import { pastThreshold } from "../../../editor/drag.svelte";
    import AbilityIcon from "./ability-icon.svelte";

    let {
        steps,
        kit,
        onmove,
    }: {
        steps: readonly OrderStep[];
        kit: HeroKit;
        /** `to` is the index the step ends up at; false when the move was refused. */
        onmove: (from: number, to: number) => boolean;
    } = $props();

    let list = $state<HTMLOListElement>();
    let dragging = $state<{ from: number; insert: number } | null>(null);
    let press: { from: number; x: number; y: number; pointer: number } | null = null;

    const kindText = (step: OrderStep) =>
        step.tier === 0 ? t("builds.editor.abilities.unlock") : t("builds.editor.abilities.tier", { tier: step.tier });

    const chipLabel = (step: OrderStep, i: number) =>
        t("builds.editor.abilities.chip_label", {
            step: i + 1,
            ability: kit.abilities.get(step.abilityId)?.name ?? "?",
            kind: kindText(step),
        });

    const chips = () => [...(list?.querySelectorAll<HTMLElement>("[data-step-chip]") ?? [])];

    /** Insertion index before removal: before the first chip on the pointer's row whose middle is right of it. */
    function insertionAt(x: number, y: number): number {
        const rects = chips().map((el) => el.getBoundingClientRect());
        const row = rects.findIndex((r) => y < r.bottom);
        if (row < 0) return rects.length;
        const top = rects[row]!.top;
        for (let i = row; i < rects.length && rects[i]!.top === top; i++) {
            if (x < rects[i]!.left + rects[i]!.width / 2) return i;
        }
        let end = row;
        while (end < rects.length && rects[end]!.top === top) end++;
        return end;
    }

    async function focusChip(index: number) {
        await tick();
        chips()[index]?.focus();
    }

    function move(from: number, to: number) {
        if (to < 0 || to >= steps.length || from === to) return;
        if (onmove(from, to)) void focusChip(to);
    }

    function pointerdown(event: PointerEvent, from: number) {
        if (event.button !== 0) return;
        press = { from, x: event.clientX, y: event.clientY, pointer: event.pointerId };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function pointermove(event: PointerEvent) {
        if (!press || event.pointerId !== press.pointer) return;
        if (!dragging && !pastThreshold(press, { x: event.clientX, y: event.clientY })) return;
        dragging = { from: press.from, insert: insertionAt(event.clientX, event.clientY) };
    }

    function pointerup(event: PointerEvent) {
        if (!press || event.pointerId !== press.pointer) return;
        const drop = dragging;
        press = null;
        dragging = null;
        if (!drop) return;
        move(drop.from, drop.insert > drop.from ? drop.insert - 1 : drop.insert);
    }

    function cancel() {
        press = null;
        dragging = null;
    }

    function keydown(event: KeyboardEvent, i: number) {
        if (event.key === "Escape" && dragging) {
            event.preventDefault();
            cancel();
        } else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            move(i, event.key === "ArrowLeft" ? i - 1 : i + 1);
        }
    }

    const caretBefore = (i: number) =>
        dragging !== null && dragging.insert === i && i !== dragging.from && i !== dragging.from + 1;
</script>

<ol
    bind:this={list}
    class="flex flex-wrap gap-x-2 gap-y-2"
    aria-label={t("builds.editor.abilities.sequence")}
    data-testid="ability-sequence"
>
    {#each steps as step, i (i)}
        {@const ability = kit.abilities.get(step.abilityId)}
        <li class="relative">
            {#if caretBefore(i)}
                <span class="absolute inset-y-0 -left-[5px] w-0.5 rounded bg-brass" aria-hidden="true"></span>
            {/if}
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
                    "flex cursor-grab touch-none items-center gap-1.5 rounded-md border py-1 pr-2 pl-1 select-none",
                    step.tier === 0 ? "border-brass/40 bg-brass/10" : "border-border bg-muted/20",
                    dragging?.from === i && "opacity-40",
                )}
            >
                <span class="w-4 text-right text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                <AbilityIcon {ability} ultimate={step.abilityId === kit.ultimateId} class="size-7" />
                <span class="flex flex-col items-start gap-0.5">
                    <span class="flex gap-0.5" aria-hidden="true">
                        {#if step.tier === 0}
                            <span class="text-[10px] leading-none font-semibold text-brass uppercase">
                                {t("builds.editor.abilities.unlock_short")}
                            </span>
                        {:else}
                            {#each TIER_COSTS as _, pip (pip)}
                                <span
                                    class="size-1.5 rounded-full {pip < step.tier
                                        ? 'bg-brass'
                                        : 'bg-muted-foreground/30'}"
                                ></span>
                            {/each}
                        {/if}
                    </span>
                    {#if step.level !== null}
                        <span class="text-[11px] leading-none text-muted-foreground tabular-nums">
                            {t("builds.editor.abilities.level", { level: step.level })}
                        </span>
                    {/if}
                </span>
            </Button>
        </li>
    {/each}
    {#if caretBefore(steps.length)}
        <li class="relative w-0" aria-hidden="true">
            <span class="absolute inset-y-0 -left-[5px] w-0.5 rounded bg-brass"></span>
        </li>
    {/if}
</ol>
