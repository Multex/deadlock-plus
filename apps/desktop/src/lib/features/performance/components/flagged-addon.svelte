<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Badge, { type BadgeVariant } from "@deadlock-plus/ui/badge.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { AddonInfo, AddonScan, Severity } from "../api";
    import { flattenFindings, ruleTitle, severityLabel, worstSeverity } from "../performance";
    import AddonMeta from "./addon-meta.svelte";

    const SEVERITY_BADGE: Record<Severity, BadgeVariant> = {
        high: "destructive",
        medium: "warning",
        low: "secondary",
    };

    type Props = {
        addon: AddonInfo;
        scan: AddonScan;
    };

    let { addon, scan }: Props = $props();

    const worst = $derived(worstSeverity(scan));
</script>

<Card as="li" radius="md" padding="none">
    <div class="flex items-center gap-3 px-4 py-3">
        <AddonMeta {addon} {scan} />
        {#if worst}
            <Badge variant={SEVERITY_BADGE[worst]}>{severityLabel(worst)}</Badge>
        {/if}
    </div>
    <ul class="flex flex-col divide-y divide-border border-t border-border">
        {#each flattenFindings(scan) as f}
            <li class="flex flex-col gap-2 px-4 py-3">
                <div class="flex items-center gap-2">
                    <Badge variant={SEVERITY_BADGE[f.severity]}>{severityLabel(f.severity)}</Badge>
                    <span class="text-sm font-medium">{ruleTitle(f.rule)}</span>
                </div>
                <p class="text-sm text-muted-foreground">{f.message}</p>
                <pre class="overflow-x-auto rounded-sm bg-muted px-3 py-2 font-mono text-xs"><code>{f.snippet}</code
                    ></pre>
                <p class="break-all font-mono text-xs text-muted-foreground">
                    {f.path}:{f.line} · {f.function}
                </p>
            </li>
        {/each}
    </ul>
</Card>
