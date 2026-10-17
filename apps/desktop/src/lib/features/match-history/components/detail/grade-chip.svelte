<script lang="ts">
    import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import GradeBar from "$lib/features/live/components/grade-bar.svelte";
    import { LETTER_COLOR } from "$lib/features/live/grade-strip";
    import { gradeTone, ordinalCategory, scoreText, STAT_LABEL, statLines } from "../../mvp";

    let { grade }: { grade: MvpPlayerGrade } = $props();

    const color = $derived(LETTER_COLOR[gradeTone(grade.letter)]);
    const score = $derived(scoreText(grade.s10, i18n.locale));
    const place = $derived(
        t(`match_history.detail.grade.place_ordinal_${ordinalCategory(grade.place, i18n.locale)}`, {
            place: grade.place,
        }),
    );
    const lines = $derived(statLines(grade));
    const percent = (n: number) => formatNumber(n / 100, { style: "percent" });
</script>

<Tooltip.Root delayDuration={100}>
    <Tooltip.Trigger>
        {#snippet child({ props })}
            <button
                {...props}
                type="button"
                class="chip"
                aria-label={t("match_history.detail.grade.aria", { letter: grade.letter, score, place })}
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
            <p class="text-[11px] text-muted-foreground">{t("match_history.detail.grade.better_than")}</p>
            {#each lines as line (line.key)}
                <div class="line">
                    <span class="truncate">{t(STAT_LABEL[line.key])}</span>
                    <GradeBar score={line.better} mini />
                    <span class="text-right tabular-nums">{percent(line.better)}</span>
                </div>
            {/each}
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
        display: grid;
        grid-template-columns: minmax(0, 1fr) 4.5rem 2.5rem;
        align-items: center;
        gap: 8px;
        font-size: 11px;
    }
</style>
