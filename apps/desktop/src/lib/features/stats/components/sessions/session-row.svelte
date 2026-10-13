<script lang="ts">
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { formatPlaytime } from "../../stats";
    import { signed } from "../../format";
    import SyncingBadge from "../shared/syncing-badge.svelte";
    import { sessionVerdict, summarizeSession, type Session, type Verdict } from "@deadlock-plus/stats/sessions";

    let { session }: { session: Session } = $props();

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

    const sum = $derived(summarizeSession(session));
    const verdict = $derived(sessionVerdict(sum));
    const syncing = $derived(session.matches.filter((m) => m.provisional).length);

    const when = (s: number) =>
        formatDate(s * 1000, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
</script>

<Card
    as="li"
    radius="md"
    padding="none"
    class="flex flex-wrap items-center gap-x-6 gap-y-2 border-l-4 px-5 py-4 {EDGE[verdict]}"
>
    <div class="min-w-40 flex-1">
        <p class="flex items-center gap-2 text-base font-medium">
            {when(sum.startTime)}
            {#if syncing > 0}<SyncingBadge count={syncing} />{/if}
        </p>
        <p class="text-sm text-muted-foreground">{verdictLabel(verdict)}</p>
    </div>
    <dl class="flex gap-8 text-right text-sm">
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.games")}</dt>
            <dd class="text-base">{sum.games}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.record")}</dt>
            <dd class="text-base">{sum.wins} / {sum.losses}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.length")}</dt>
            <dd class="text-base">{formatPlaytime(sum.durationS)}</dd>
        </div>
        <div>
            <dt class="text-xs text-muted-foreground">{t("sessions.row.rank_change")}</dt>
            <dd class="text-base">{sum.netDelta === null ? "-" : signed(sum.netDelta)}</dd>
        </div>
    </dl>
</Card>
