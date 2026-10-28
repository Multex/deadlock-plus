<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { cleanupMatches, listCleanupRules, saveCleanupRules } from "$lib/features/demos/api";
    import { cleanupFailed, persistRules } from "$lib/features/demos/cleanup-rules";
    import {
        formatBytes,
        gbToMb,
        matchesTotal,
        mbToGb,
        ruleLabel,
        withAllRules,
        type CleanupMatch,
        type CleanupRule,
    } from "$lib/features/demos/demos";

    let { open = $bindable(false), onreview }: { open?: boolean; onreview: (fileNames: string[]) => void } = $props();

    const SAVE_DELAY_MS = 400;

    let rules = $state<CleanupRule[]>([]);
    let stored: CleanupRule[] = [];
    let matches = $state<CleanupMatch[]>([]);
    let loading = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    const total = $derived(matchesTotal(matches));
    const anyEnabled = $derived(rules.some((r) => r.enabled));

    $effect(() => {
        if (open) void load();
        else clearTimeout(timer);
    });

    async function load() {
        loading = true;
        try {
            rules = withAllRules(await listCleanupRules());
            stored = $state.snapshot(rules);
            await refresh();
        } catch (e) {
            cleanupFailed(e, "load");
        } finally {
            loading = false;
        }
    }

    async function refresh() {
        const mine = ++generation;
        const found = await cleanupMatches();
        if (mine === generation) matches = found;
    }

    function changed() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const result = await persistRules($state.snapshot(rules), stored, saveCleanupRules);
            if (!result.saved) {
                rules = result.rules;
                return;
            }
            stored = result.rules;
            try {
                await refresh();
            } catch (e) {
                cleanupFailed(e, "check");
            }
        }, SAVE_DELAY_MS);
    }

    function setWhole(rule: CleanupRule, raw: string) {
        const value = Math.floor(Number(raw));
        if (rule.kind === "olderThanDays" && Number.isFinite(value) && value >= 1) {
            rule.days = value;
            changed();
        }
    }

    function setGb(rule: CleanupRule, raw: string) {
        if (rule.kind === "largerThanMb" && raw.trim() !== "" && Number(raw) > 0) {
            rule.mb = gbToMb(Number(raw));
            changed();
        }
    }

    function labelsFor(m: CleanupMatch) {
        return m.ruleIds
            .map((id) => rules.find((r) => r.id === id))
            .filter((r): r is CleanupRule => r !== undefined)
            .map(ruleLabel)
            .join(", ");
    }

    function review() {
        open = false;
        onreview(matches.map((m) => m.fileName));
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content>
        <div class="flex flex-col gap-1.5">
            <Dialog.Title>{t("demos.cleanup.title")}</Dialog.Title>
            <Dialog.Description>
                {t("demos.cleanup.description")}
            </Dialog.Description>
        </div>

        <ul class="flex flex-col gap-2">
            {#each rules as rule (rule.id)}
                <li class="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                    <Switch
                        checked={rule.enabled}
                        aria-label={ruleLabel(rule)}
                        onCheckedChange={(on) => {
                            rule.enabled = on;
                            changed();
                        }}
                    />
                    {#if rule.kind === "olderThanDays"}
                        <span class="text-sm">{t("demos.cleanup.older_than")}</span>
                        <Input
                            type="number"
                            min="1"
                            step="1"
                            class="h-8 w-20"
                            aria-label={t("demos.cleanup.days_label")}
                            value={String(rule.days)}
                            oninput={(e) => setWhole(rule, e.currentTarget.value)}
                        />
                        <span class="text-sm">{t("demos.cleanup.days_unit")}</span>
                    {:else if rule.kind === "largerThanMb"}
                        <span class="text-sm">{t("demos.cleanup.larger_than")}</span>
                        <Input
                            type="number"
                            min="0.1"
                            step="0.5"
                            class="h-8 w-20"
                            aria-label={t("demos.cleanup.gigabytes_label")}
                            value={String(mbToGb(rule.mb))}
                            oninput={(e) => setGb(rule, e.currentTarget.value)}
                        />
                        <span class="text-sm">{t("demos.cleanup.gb_unit")}</span>
                    {:else}
                        <span class="text-sm">{ruleLabel(rule)}</span>
                    {/if}
                </li>
            {/each}
        </ul>

        <div class="flex min-h-0 flex-1 flex-col gap-2">
            <p class="text-sm">
                {#if !anyEnabled}
                    <span class="text-muted-foreground">{t("demos.cleanup.turn_on")}</span>
                {:else if loading}
                    <span class="text-muted-foreground">{t("demos.cleanup.checking")}</span>
                {:else}
                    {tn("demos.cleanup.matches", total.count, { size: formatBytes(total.bytes) })}
                {/if}
            </p>
            {#if anyEnabled && matches.length > 0}
                <ul class="max-h-40 overflow-y-auto rounded-md border border-border text-xs">
                    {#each matches as m (m.fileName)}
                        <li
                            class="flex items-baseline justify-between gap-3 border-b border-border px-3 py-1.5 last:border-b-0"
                        >
                            <span>
                                {t("demos.match_id", { id: m.matchId })}
                                <span class="text-muted-foreground"> · {labelsFor(m)}</span>
                            </span>
                            <span class="shrink-0 text-muted-foreground">{formatBytes(m.size)}</span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="flex justify-end gap-2">
            <Button variant="outline" onclick={() => (open = false)}>{t("demos.cleanup.close")}</Button>
            <Button disabled={!anyEnabled || loading || matches.length === 0} onclick={review}>
                {tn("demos.cleanup.review", total.count)}
            </Button>
        </div>
    </Dialog.Content>
</Dialog.Root>
