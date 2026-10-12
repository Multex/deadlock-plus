<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "$lib/ui/card.svelte";
    import SettingRow from "$lib/ui/setting-row.svelte";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import { Copy, Download, RefreshCw } from "@lucide/svelte";
    import Button from "$lib/ui/button.svelte";
    import Switch from "$lib/ui/switch.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { updater } from "$lib/features/updates/updater.svelte";
    import { updateLine } from "$lib/features/updates/status";
    import ReleaseNotes from "$lib/features/updates/components/release-notes.svelte";
    import { whatsNew } from "$lib/features/updates/whats-new.svelte";
    import { WHATS_NEW_ROUTE } from "$lib/features/updates/whats-new";
    import { aboutGroups, aboutText, getAppInfo, type AppInfo } from "$lib/features/settings/about";

    let { show }: { show: (id: string) => boolean } = $props();

    let info = $state<AppInfo | null>(null);

    onMount(() => {
        getAppInfo()
            .then((i) => (info = i))
            .catch(() => {});
    });

    async function copyInfo() {
        if (!info) return;
        try {
            await navigator.clipboard.writeText(aboutText(info));
            toast.success(t("settings.about_page.copied"));
        } catch {
            toast.error(t("settings.about_page.copy_failed"));
        }
    }
</script>

{#if show("version") && info}
    <Card as="section">
        <div class="flex items-center justify-between gap-4">
            <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.version")}</h2>
            <div class="flex items-center gap-2">
                <SupportButton />
                <Button variant="outline" size="sm" onclick={copyInfo}>
                    <Copy />
                    {t("settings.about_page.copy")}
                </Button>
            </div>
        </div>
        <div class="mt-3 flex flex-col gap-4">
            {#each aboutGroups(info) as group (group.title)}
                <div>
                    <h3 class="mb-1 text-xs uppercase tracking-widest text-muted-foreground/70">{group.title}</h3>
                    <dl class="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-1 text-sm">
                        {#each group.rows as [label, value] (label)}
                            <dt class="text-muted-foreground">{label}</dt>
                            <dd class="min-w-0 break-words select-text">{value}</dd>
                        {/each}
                    </dl>
                </div>
            {/each}
        </div>
    </Card>
{/if}

{#if show("updates")}
    <Card as="section">
        <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
                <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.updates")}</h2>
                <p class="text-sm text-muted-foreground" aria-live="polite">{updateLine(updater)}</p>
            </div>
            {#if updater.phase === "available"}
                <Button size="sm" onclick={() => updater.install()}>
                    <Download />
                    {t("settings.about_page.install", { version: updater.version ?? "" })}
                </Button>
            {:else}
                <Button
                    variant="outline"
                    size="sm"
                    disabled={updater.phase === "checking" || updater.phase === "downloading"}
                    onclick={() => updater.check()}
                >
                    <RefreshCw />
                    {t("settings.about_page.check_now")}
                </Button>
            {/if}
        </div>
        <SettingRow
            class="mt-4 border-t pt-4"
            label={t("settings.about_page.auto_check_label")}
            for="auto-update-check"
            description={t("settings.about_page.auto_check_description")}
        >
            <Switch
                id="auto-update-check"
                checked={settings.autoUpdateCheck}
                onCheckedChange={(v) => settings.setAutoUpdateCheck(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("whats-new")}
    <Card as="section">
        <div class="flex items-center justify-between gap-3">
            <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.whats_new")}</h2>
            <Button variant="outline" size="sm" onclick={() => goto(WHATS_NEW_ROUTE)}
                >{t("settings.about_page.open_full")}</Button
            >
        </div>
        <div class="mt-3">
            {#if whatsNew.history.length > 0}
                <ReleaseNotes entries={whatsNew.history} />
            {:else}
                <p class="text-sm text-muted-foreground">{t("settings.about_page.no_notes")}</p>
            {/if}
        </div>
    </Card>
{/if}
