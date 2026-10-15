<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Bucket } from "@deadlock-plus/stats/sessions";
    import { pct } from "../../format";
    import type { Finding } from "../../insights";
    import Findings from "./findings.svelte";

    let { findings, baseline }: { findings: Finding[]; baseline: Bucket } = $props();

    let open = $state(true);
</script>

<section class="flex flex-col gap-3">
    <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
            <h2 class="text-xl">{t("sessions.results.heading")}</h2>
            {#if open}
                <p class="mt-1 text-sm text-muted-foreground">
                    {baseline.winrate === null
                        ? t("sessions.results.intro")
                        : t("sessions.results.intro_detail", { winrate: pct(baseline.winrate), games: baseline.games })}
                </p>
            {/if}
        </div>
        <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls="session-findings"
            onclick={() => (open = !open)}
        >
            {open ? t("sessions.results.hide") : t("sessions.results.show")}
        </Button>
    </div>
    <div id="session-findings" hidden={!open}>
        <Findings {findings} baseline={baseline.winrate} />
    </div>
</section>
