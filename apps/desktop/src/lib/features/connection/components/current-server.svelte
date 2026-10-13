<script lang="ts">
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
    import Flag from "$lib/components/flag.svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { gapVariant } from "../connection";
    import type { RelayInfo } from "../types";

    type Props = {
        gameRunning: boolean;
        relay: RelayInfo | null;
    };

    let { gameRunning, relay }: Props = $props();
</script>

<Section title={t("connection.current.title")}>
    {#if !gameRunning}
        <p class="text-sm text-muted-foreground">{t("connection.current.not_running")}</p>
    {:else if !relay}
        <p class="text-sm text-muted-foreground">{t("connection.current.not_connected")}</p>
    {:else}
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div class="flex items-center gap-3">
                <Flag code={relay.countryCode} />
                <div>
                    <div class="text-base font-medium">
                        {relay.description ?? t("connection.current.unknown_relay")}
                    </div>
                    <div class="font-mono text-xs text-muted-foreground">
                        {relay.popCode ? `${relay.popCode} · ` : ""}{relay.ip}:{relay.port}
                    </div>
                </div>
            </div>
            <dl class="flex gap-6 text-xs">
                <div>
                    <dt class="text-muted-foreground">{t("connection.current.in")}</dt>
                    <dd class="tabular-nums">
                        {t("connection.pkt_per_second", { value: formatNumber(Math.round(relay.ppsIn)) })}
                    </dd>
                </div>
                <div>
                    <dt class="text-muted-foreground">{t("connection.current.out")}</dt>
                    <dd class="tabular-nums">
                        {t("connection.pkt_per_second", { value: formatNumber(Math.round(relay.ppsOut)) })}
                    </dd>
                </div>
                <div>
                    <dt class="text-muted-foreground">{t("connection.current.gap")}</dt>
                    <dd>
                        <Badge variant={gapVariant(relay.maxGapMs)}>
                            {t("connection.ms", { value: formatNumber(Math.round(relay.maxGapMs)) })}
                        </Badge>
                    </dd>
                </div>
            </dl>
        </div>
    {/if}
</Section>
