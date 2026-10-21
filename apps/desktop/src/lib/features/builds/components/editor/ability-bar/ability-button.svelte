<script lang="ts">
    import { Lock, Star } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { AbilityInfo } from "../../../build-detail.svelte";
    import type { AbilityProgress } from "../../../editor/ability-order";
    import AbilityArt from "./ability-art.svelte";
    import TierPips from "./tier-pips.svelte";

    let {
        ability,
        slot,
        ultimate,
        progress,
        nextStep,
        alsoRemoves,
        onappend,
        onremove,
        onpreview,
    }: {
        ability: AbilityInfo | undefined;
        /** 1-based slot number, as the game's keys 1-4. */
        slot: number;
        ultimate: boolean;
        progress: AbilityProgress;
        /** 1-based number the next appended step gets. */
        nextStep: number;
        /** 1-based numbers of the other steps removing `step` takes with it. */
        alsoRemoves: (step: number) => number[];
        onappend: () => void;
        onremove: (step: number) => void;
        onpreview: (on: boolean) => void;
    } = $props();

    const locked = $derived(progress.tier === null);
    const taken = $derived(progress.tier ?? 0);
    const maxed = $derived(progress.tier === 3);
    const blocked = $derived(progress.next.kind === "blocked");

    const kindText = (tier: number) =>
        tier === 0 ? t("builds.editor.abilities.unlock") : t("builds.editor.abilities.tier", { tier });

    const addLine = $derived.by(() => {
        const next = progress.next;
        if (next.kind === "blocked") return t(`builds.editor.abilities.reason_${next.reason}`);
        const params = { kind: kindText(next.tier), step: nextStep };
        return next.level === null
            ? t("builds.editor.abilities.adds", params)
            : t("builds.editor.abilities.adds_at", { ...params, level: next.level });
    });

    const removeLine = $derived.by(() => {
        if (progress.lastStep === null) return null;
        const line = t("builds.editor.abilities.right_click_removes", { step: progress.lastStep + 1 });
        const others = alsoRemoves(progress.lastStep);
        if (others.length === 0) return line;
        const steps = others.map((n) => `#${n}`).join(", ");
        return `${line} ${tn("builds.editor.abilities.also_removes", others.length, { steps })}`;
    });

    function contextmenu(event: MouseEvent) {
        event.preventDefault();
        if (progress.lastStep !== null) onremove(progress.lastStep);
    }

    function keydown(event: KeyboardEvent) {
        if ((event.key === "Delete" || event.key === "Backspace") && progress.lastStep !== null) {
            event.preventDefault();
            onremove(progress.lastStep);
        }
    }
</script>

<div class="flex w-[84px] flex-col items-center gap-1.5" data-ability-slot={slot}>
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={200}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant="unstyled"
                        aria-label={ability?.name ?? "?"}
                        aria-disabled={blocked}
                        data-state-locked={locked || undefined}
                        onclick={onappend}
                        oncontextmenu={contextmenu}
                        onkeydown={keydown}
                        onpointerenter={() => onpreview(true)}
                        onpointerleave={() => onpreview(false)}
                        onfocus={() => onpreview(true)}
                        onblur={() => onpreview(false)}
                        class={cn(
                            "group relative grid size-16 shrink-0 place-items-center rounded-full border-2 transition-[border-color,box-shadow,background-color,transform] duration-150",
                            "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_10%,transparent),transparent_70%)] active:scale-95",
                            locked ? "border-border bg-muted/40" : "border-brass/55 bg-muted/60",
                            maxed && "border-brass shadow-[0_0_14px_color-mix(in_oklch,var(--brass)_35%,transparent)]",
                            ultimate && !locked && "border-brass",
                            blocked
                                ? "cursor-not-allowed"
                                : "hover:border-brass hover:shadow-[0_0_0_3px_color-mix(in_oklch,var(--brass)_18%,transparent)]",
                        )}
                    >
                        <AbilityArt
                            {ability}
                            class={cn(
                                "size-10 transition-[opacity,filter] duration-150",
                                locked && "opacity-45 grayscale group-hover:opacity-70",
                            )}
                        />
                        {#if locked}
                            <span
                                class="absolute -bottom-0.5 -left-0.5 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground"
                                aria-hidden="true"
                            >
                                <Lock class="size-2.5" />
                            </span>
                        {/if}
                        {#if ultimate}
                            <span
                                class="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-brass text-background shadow-sm"
                                title={t("builds.editor.abilities.ultimate")}
                            >
                                <Star class="size-3 fill-current" />
                                <span class="sr-only">{t("builds.editor.abilities.ultimate")}</span>
                            </span>
                        {/if}
                    </Button>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" class="max-w-64">
                <p class="font-semibold">{ability?.name ?? "?"}</p>
                <p class={cn(blocked && "text-warning")}>{addLine}</p>
                {#if removeLine}<p class="text-muted-foreground">{removeLine}</p>{/if}
            </Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
    <TierPips {taken} next={progress.next.kind === "next" ? progress.next.tier : null} />
    <span class="line-clamp-2 h-[26px] w-full text-center text-[11px] leading-[13px] text-muted-foreground"
        >{ability?.name ?? "?"}</span
    >
</div>
