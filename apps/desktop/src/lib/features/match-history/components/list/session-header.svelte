<script lang="ts">
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { SessionGroup } from "@deadlock-plus/match/sessions";
    import type { Verdict } from "@deadlock-plus/stats/sessions";
    import { signed } from "$lib/features/stats/format";
    import { formatPlaytime } from "$lib/features/stats/stats";
    import SyncingBadge from "$lib/features/stats/components/shared/syncing-badge.svelte";

    let { group, nowS }: { group: SessionGroup; nowS: number } = $props();

    const EDGE: Record<Verdict, string> = {
        excellent: "border-l-brass",
        good: "border-l-primary",
        bad: "border-l-destructive",
        neutral: "border-l-muted-foreground/60",
    };
    const verdictLabel = (v: Verdict) =>
        ({
            excellent: t("sessions.row.excellent"),
            good: t("sessions.row.good"),
            bad: t("sessions.row.bad"),
            neutral: t("sessions.row.neutral"),
        })[v];

    const dayOf = (s: number) => new Date(s * 1000).toDateString();

    const day = $derived.by(() => {
        const key = dayOf(group.startTime);
        if (key === dayOf(nowS)) return t("home.today");
        if (key === dayOf(nowS - 86_400)) return t("home.yesterday");
        return formatDate(group.startTime * 1000, { weekday: "long", day: "numeric", month: "long" });
    });
    const time = $derived(formatDate(group.startTime * 1000, { hour: "2-digit", minute: "2-digit" }));
</script>

<Card
    radius="md"
    padding="none"
    class="flex flex-wrap items-center gap-x-6 gap-y-2 border-l-4 px-5 py-4 {EDGE[group.verdict]}"
>
    <div class="min-w-40 flex-1">
        <h3 class="flex items-center gap-2 text-base font-medium">
            {day}, {time}
            {#if group.syncing > 0}<SyncingBadge count={group.syncing} />{/if}
        </h3>
        <p class="text-sm text-muted-foreground">{verdictLabel(group.verdict)}</p>
    </div>
    <dl class="flex gap-8 text-right text-sm tabular-nums">
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.games")}</dt>
            <dd class="text-base">{group.games}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.record")}</dt>
            <dd class="text-base">{group.wins} / {group.losses}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.length")}</dt>
            <dd class="text-base">{formatPlaytime(group.durationS)}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.rank_change")}</dt>
            <dd class="text-base">{group.netDelta === null ? "-" : signed(group.netDelta)}</dd>
        </div>
    </dl>
</Card>
