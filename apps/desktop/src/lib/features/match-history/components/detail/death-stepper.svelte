<script lang="ts">
    import { tick } from "svelte";
    import { ChevronLeft, ChevronRight, Eye, StepForward } from "@lucide/svelte";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { stepperAction, stepperView, type StepperAction } from "@deadlock-plus/match/death-steps";

    interface Props {
        /** Zero-based; -1 when no death is selected. */
        index: number;
        count: number;
        summary: string | null;
        onstep: (delta: -1 | 1) => void;
        onclear: () => void;
    }

    let { index, count, summary, onstep, onclear }: Props = $props();

    const view = $derived(stepperView(index, count));

    let root = $state<HTMLElement | null>(null);

    // Start and Show all remove the button that was pressed; focus moves on so the keys keep working.
    async function refocus() {
        await tick();
        root?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
    }

    function run(action: StepperAction) {
        if (action === "prev") return onstep(-1);
        if (action === "next") return onstep(1);
        if (action === "start") onstep(1);
        else onclear();
        void refocus();
    }

    function onkeydown(e: KeyboardEvent) {
        const action = stepperAction(e.key, view.kind);
        if (action === null) return;
        e.preventDefault();
        run(action);
    }
</script>

<div
    bind:this={root}
    class="flex min-h-[34px] flex-wrap items-center gap-2 text-xs"
    role="toolbar"
    tabindex="-1"
    aria-label={t("match_history.detail.replay.stepper_aria")}
    {onkeydown}
>
    {#if view.kind === "empty"}
        <span class="text-sm text-muted-foreground" role="status">
            {t("match_history.detail.replay.no_deaths")}
        </span>
    {:else if view.kind === "idle"}
        <span class="text-sm font-medium tabular-nums" role="status">
            {tn("match_history.detail.replay.death_count", view.count)}
        </span>
        <Button size="sm" variant="outline" data-step-focus onclick={() => run("start")}>
            <StepForward aria-hidden="true" />
            {t("match_history.detail.replay.step_start")}
        </Button>
    {:else}
        <!-- Not `disabled`: a disabled button drops focus, which would end arrow-key stepping at either end. -->
        <div class="inline-flex items-center rounded-md border border-input shadow-sm">
            <Button
                size="sm"
                variant="ghost"
                aria-label={t("match_history.detail.replay.step_prev")}
                title={t("match_history.detail.replay.step_prev")}
                aria-disabled={view.atStart}
                class={cn("rounded-r-none", view.atStart && "opacity-40")}
                onclick={() => run("prev")}
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            <span
                class="min-w-14 border-x border-input px-2 text-center leading-8 font-semibold tabular-nums"
                role="status"
            >
                {t("match_history.detail.replay.death_step", { index: view.position, total: view.count })}
            </span>
            <Button
                size="sm"
                variant="ghost"
                data-step-focus
                aria-label={t("match_history.detail.replay.step_next")}
                title={t("match_history.detail.replay.step_next")}
                aria-disabled={view.atEnd}
                class={cn("rounded-l-none", view.atEnd && "opacity-40")}
                onclick={() => run("next")}
            >
                <ChevronRight aria-hidden="true" />
            </Button>
        </div>
        <Button size="sm" variant="ghost" onclick={() => run("clear")}>
            <Eye aria-hidden="true" />
            {t("match_history.detail.replay.step_show_all")}
        </Button>
        {#if summary}
            <span class="text-muted-foreground" role="status">{summary}</span>
        {/if}
    {/if}
</div>
