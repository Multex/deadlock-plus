<script lang="ts">
    import { Lock, Star } from "@lucide/svelte";
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { AbilityInfo } from "../../../build-detail.svelte";
    import { abilityTooltipAt } from "../../../ability-tooltip";
    import type { AbilityProgress } from "../../../editor/ability-order";
    import AbilityArt from "./ability-art.svelte";
    import AbilityHover from "./ability-hover.svelte";
    import TierPips from "./tier-pips.svelte";

    let {
        ability,
        tooltip,
        slot,
        ultimate,
        progress,
        readonly = false,
        nextStep = 0,
        alsoRemoves = () => [],
        onappend,
        onremove,
        onpreview,
    }: {
        ability: AbilityInfo | undefined;
        /** The game's tooltip for this ability; the hover falls back to its name without one. */
        tooltip?: AbilityTooltip;
        /** 1-based slot number, as the game's keys 1-4. */
        slot: number;
        ultimate: boolean;
        /** `next` is only read when editing. */
        progress: Pick<AbilityProgress, "tier" | "lastStep"> & { next?: AbilityProgress["next"] };
        readonly?: boolean;
        /** 1-based number the next appended step gets. */
        nextStep?: number;
        /** 1-based numbers of the other steps removing `step` takes with it. */
        alsoRemoves?: (step: number) => number[];
        onappend?: () => void;
        onremove?: (step: number) => void;
        onpreview?: (on: boolean) => void;
    } = $props();

    const locked = $derived(progress.tier === null);
    const taken = $derived(progress.tier ?? 0);
    const maxed = $derived(progress.tier === 3);
    const blocked = $derived(!readonly && progress.next?.kind === "blocked");
    const nextTier = $derived(!readonly && progress.next?.kind === "next" ? progress.next.tier : null);

    const model = $derived(tooltip ? abilityTooltipAt(tooltip, progress.tier) : null);

    const kindText = (tier: number) =>
        tier === 0 ? t("builds.editor.abilities.unlock") : t("builds.editor.abilities.tier", { tier });

    const addLine = $derived.by(() => {
        const next = progress.next;
        if (!next) return null;
        if (next.kind === "blocked") return t(`builds.editor.abilities.reason_${next.reason}`);
        const params = { kind: kindText(next.tier), step: nextStep };
        return next.level === null
            ? t("builds.editor.abilities.adds", params)
            : t("builds.editor.abilities.adds_at", { ...params, level: next.level });
    });

    const removeLine = $derived.by(() => {
        if (readonly || progress.lastStep === null) return null;
        const line = t("builds.editor.abilities.right_click_removes", { step: progress.lastStep + 1 });
        const others = alsoRemoves(progress.lastStep);
        if (others.length === 0) return line;
        const steps = others.map((n) => `#${n}`).join(", ");
        return `${line} ${tn("builds.editor.abilities.also_removes", others.length, { steps })}`;
    });

    const finalLine = $derived.by(() => {
        if (progress.tier === null || progress.lastStep === null) return t("builds.editor.abilities.final_locked");
        const step = progress.lastStep + 1;
        return progress.tier === 0
            ? t("builds.editor.abilities.final_unlocked", { step })
            : t("builds.editor.abilities.final_tier", { tier: progress.tier, step });
    });

    function contextmenu(event: MouseEvent) {
        event.preventDefault();
        if (progress.lastStep !== null) onremove?.(progress.lastStep);
    }

    function keydown(event: KeyboardEvent) {
        if ((event.key === "Delete" || event.key === "Backspace") && progress.lastStep !== null) {
            event.preventDefault();
            onremove?.(progress.lastStep);
        }
    }

    /** Calls the tooltip trigger's own handler that a handler of ours replaces. */
    const forward = (handler: unknown, event: Event) =>
        typeof handler === "function" ? (handler as (event: Event) => void)(event) : undefined;

    const orbClass = $derived(
        cn(
            "group relative grid size-16 shrink-0 place-items-center rounded-full border-2 transition-[border-color,box-shadow,background-color,transform] duration-150",
            "bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_10%,transparent),transparent_70%)]",
            locked ? "border-border bg-muted/40" : "border-brass/55 bg-muted/60",
            maxed && "border-brass shadow-[0_0_14px_color-mix(in_oklch,var(--brass)_35%,transparent)]",
            ultimate && !locked && "border-brass",
            !readonly &&
                (blocked
                    ? "cursor-not-allowed active:scale-95"
                    : "hover:border-brass hover:shadow-[0_0_0_3px_color-mix(in_oklch,var(--brass)_18%,transparent)] active:scale-95"),
        ),
    );
</script>

{#snippet orb()}
    <AbilityArt
        {ability}
        class={cn(
            "size-10 transition-[opacity,filter] duration-150",
            locked && "opacity-45 grayscale",
            locked && !readonly && "group-hover:opacity-70",
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
{/snippet}

<div class="flex w-[84px] flex-col items-center gap-1.5" data-ability-slot={slot}>
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={200}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    {#if readonly}
                        <span {...props} role="img" aria-label={ability?.name ?? "?"} class={orbClass}>
                            {@render orb()}
                        </span>
                    {:else}
                        <Button
                            {...props}
                            variant="unstyled"
                            aria-label={ability?.name ?? "?"}
                            aria-disabled={blocked}
                            data-state-locked={locked || undefined}
                            onclick={onappend}
                            oncontextmenu={contextmenu}
                            onkeydown={keydown}
                            onpointerenter={() => onpreview?.(true)}
                            onpointerleave={(event: PointerEvent) => {
                                forward(props.onpointerleave, event);
                                onpreview?.(false);
                            }}
                            onfocus={(event: FocusEvent) => {
                                forward(props.onfocus, event);
                                onpreview?.(true);
                            }}
                            onblur={(event: FocusEvent) => {
                                forward(props.onblur, event);
                                onpreview?.(false);
                            }}
                            class={orbClass}
                        >
                            {@render orb()}
                        </Button>
                    {/if}
                {/snippet}
            </Tooltip.Trigger>
            <AbilityHover {model} name={ability?.name ?? "?"}>
                {#if readonly}
                    <p>{finalLine}</p>
                {:else}
                    <p class={cn(blocked && "text-warning")}>{addLine}</p>
                    {#if removeLine}<p class="text-muted-foreground">{removeLine}</p>{/if}
                {/if}
            </AbilityHover>
        </Tooltip.Root>
    </Tooltip.Provider>
    <TierPips {taken} next={nextTier} />
    <span class="line-clamp-2 h-[26px] w-full text-center text-[11px] leading-[13px] text-muted-foreground"
        >{ability?.name ?? "?"}</span
    >
</div>
