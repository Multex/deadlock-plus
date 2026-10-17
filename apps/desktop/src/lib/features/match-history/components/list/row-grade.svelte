<script lang="ts">
    import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { LETTER_COLOR } from "$lib/features/live/grade-strip";
    import { gradeTone, ordinalCategory, scoreText } from "../../mvp";

    let { grade, class: className = "" }: { grade: MvpPlayerGrade; class?: string } = $props();

    const color = $derived(LETTER_COLOR[gradeTone(grade.letter)]);
    const place = $derived(
        t(`match_history.detail.grade.place_ordinal_${ordinalCategory(grade.place, i18n.locale)}`, {
            place: grade.place,
        }),
    );
    const label = $derived(
        t("match_history.detail.grade.aria", { letter: grade.letter, score: scoreText(grade.s10, i18n.locale), place }),
    );
</script>

<span class="inline-flex items-baseline gap-1.5 {className}" title={label}>
    <span class="sr-only">{label}</span>
    <span aria-hidden="true" class="font-heading text-sm leading-none font-bold" style:color>{grade.letter}</span>
    <span aria-hidden="true" class="text-xs leading-none text-muted-foreground tabular-nums">{place}</span>
</span>
