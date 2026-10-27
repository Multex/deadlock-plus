<script lang="ts">
    import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { LETTER_COLOR } from "$lib/features/live/grade-strip";
    import {
        gradeTone,
        METRIC_LABEL,
        ordinalCategory,
        pointsText,
        scoreText,
        statLines,
        statValueText,
    } from "../../mvp";

    let { grade }: { grade: MvpPlayerGrade } = $props();

    const color = $derived(LETTER_COLOR[gradeTone(grade.letter)]);
    const score = $derived(scoreText(grade.s10, i18n.locale));
    const ordinal = (n: number) =>
        t(`match_history.detail.grade.place_ordinal_${ordinalCategory(n, i18n.locale)}`, { place: n });
    const place = $derived(ordinal(grade.place));
    const lines = $derived(
        statLines(grade).map((line) => ({
            metric: line.metric,
            value: statValueText(line, i18n.locale, ordinal),
        })),
    );
</script>

<Tooltip.Root delayDuration={100}>
    <Tooltip.Trigger>
        {#snippet child({ props })}
            <button
                {...props}
                type="button"
                class="chip"
                aria-label={t("match_history.detail.grade.chip_aria", { letter: grade.letter, score, place })}
            >
                <span class="letter" style:color>{grade.letter}</span>
                <span class="meta">
                    <span class="score">{score}</span>
                    <span class="place">{place}</span>
                </span>
            </button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="max-w-none" style="--marker-ring: var(--popover)">
        <div class="flex w-64 flex-col gap-2 py-1">
            <div class="flex items-baseline gap-2 text-[13px]">
                <span class="flex-1 text-muted-foreground">{t("match_history.detail.grade.label")}</span>
                <span class="font-semibold tabular-nums">{score}</span>
                <span class="letter" style:color>{grade.letter}</span>
            </div>
            {#each lines as line (line.metric)}
                <div class="line">
                    <span>{t(METRIC_LABEL[line.metric])}</span>
                    <span class="tabular-nums">{line.value}</span>
                </div>
            {/each}
            <div class="line">
                <span>{t("match_history.detail.grade.farm_bonus")}</span>
                <span class="tabular-nums">{pointsText(grade.farmBonus, i18n.locale)}</span>
            </div>
        </div>
    </Tooltip.Content>
</Tooltip.Root>

<style>
    .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 6px;
        border-radius: 6px;
        font: inherit;
        color: inherit;
        cursor: default;
    }
    .chip:hover,
    .chip:focus-visible {
        background: color-mix(in oklch, var(--accent) 60%, transparent);
        outline: none;
    }
    .chip:focus-visible {
        box-shadow: 0 0 0 2px var(--ring);
    }
    .letter {
        font-family: var(--heading-font);
        font-weight: 700;
        font-size: 18px;
        line-height: 1;
    }
    .meta {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        line-height: 13px;
        font-variant-numeric: tabular-nums;
    }
    .score {
        font-size: 12px;
        font-weight: 600;
    }
    .place {
        font-size: 10px;
        color: var(--muted-foreground);
    }
    .line {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
    }
</style>
