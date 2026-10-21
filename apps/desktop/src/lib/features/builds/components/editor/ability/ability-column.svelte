<script lang="ts">
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { AbilityInfo } from "../../../build-detail.svelte";
    import { TIER_COSTS, type SlotState } from "../../../editor/ability-order";
    import AbilityIcon from "./ability-icon.svelte";

    let {
        ability,
        ultimate,
        slots,
        nextStep,
        alsoRemoves,
        onappend,
        onremove,
    }: {
        ability: AbilityInfo | undefined;
        ultimate: boolean;
        /** Unlock, then tiers 1-3. */
        slots: readonly SlotState[];
        /** 1-based number the next appended step gets. */
        nextStep: number;
        /** 1-based numbers of the other steps removing `step` takes with it. */
        alsoRemoves: (step: number) => number[];
        onappend: () => void;
        onremove: (step: number) => void;
    } = $props();

    const slotLabel = (tier: number) =>
        tier === 0 ? t("builds.editor.abilities.unlock") : t("builds.editor.abilities.tier", { tier });

    const stepText = (step: number, level: number | null) =>
        level === null
            ? t("builds.editor.abilities.step", { step })
            : t("builds.editor.abilities.step_level", { step, level });

    function hint(slot: SlotState): string {
        if (slot.kind === "blocked") return t(`builds.editor.abilities.reason_${slot.reason}`);
        if (slot.kind === "next") {
            const add = t("builds.editor.abilities.add_hint", { step: nextStep });
            return slot.level === null
                ? add
                : `${add} ${t("builds.editor.abilities.affordable_at", { level: slot.level })}`;
        }
        const remove = t("builds.editor.abilities.remove_hint", { step: slot.step + 1 });
        const others = alsoRemoves(slot.step);
        if (others.length === 0) return remove;
        const steps = others.map((n) => `#${n}`).join(", ");
        return `${remove} ${tn("builds.editor.abilities.also_removes", others.length, { steps })}`;
    }

    function press(slot: SlotState) {
        if (slot.kind === "next") onappend();
        else if (slot.kind === "filled") onremove(slot.step);
    }
</script>

<section class="flex min-w-0 flex-col gap-2" aria-label={ability?.name}>
    <header class="flex flex-col items-center gap-1.5 pb-1 text-center">
        <AbilityIcon {ability} {ultimate} class="size-14" />
        <span class="line-clamp-2 min-h-10 font-heading text-sm leading-5 font-semibold">{ability?.name ?? "?"}</span>
        {#if ultimate}
            <Badge variant="outline" class="border-brass/50 text-brass">{t("builds.editor.abilities.ultimate")}</Badge>
        {/if}
    </header>
    <Tooltip.Provider>
        {#each slots as slot, tier (tier)}
            <Tooltip.Root delayDuration={250}>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="unstyled"
                            aria-disabled={slot.kind === "blocked"}
                            data-slot-state={slot.kind}
                            onclick={() => press(slot)}
                            class={cn(
                                "flex h-11 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm",
                                slot.kind === "filled" &&
                                    "border-brass/60 bg-brass/10 hover:border-destructive/60 hover:bg-destructive/10",
                                slot.kind === "next" &&
                                    "border-dashed border-brass/60 text-foreground hover:bg-brass/15",
                                slot.kind === "blocked" &&
                                    "cursor-not-allowed border-border/60 text-muted-foreground/60",
                            )}
                        >
                            <span class="flex min-w-0 flex-col items-start leading-tight">
                                <span class="truncate font-medium">{slotLabel(tier)}</span>
                                {#if tier > 0}
                                    <span class="text-[11px] text-muted-foreground tabular-nums">
                                        {t("builds.editor.abilities.points", { points: TIER_COSTS[tier - 1] })}
                                    </span>
                                {/if}
                            </span>
                            {#if slot.kind === "filled"}
                                <span class="shrink-0 text-xs font-semibold text-brass tabular-nums">
                                    {stepText(slot.step + 1, slot.level)}
                                </span>
                            {/if}
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom">{hint(slot)}</Tooltip.Content>
            </Tooltip.Root>
        {/each}
    </Tooltip.Provider>
</section>
