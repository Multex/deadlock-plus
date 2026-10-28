<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { ChevronRight } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { indicatorKind } from "$lib/features/updates/flow";
    import { updateLine } from "$lib/features/updates/status";
    import { updateSurface } from "$lib/features/updates/update-surface.svelte";
    import { WHATS_NEW_ROUTE } from "$lib/features/updates/whats-new";
    import ThanksCard from "$lib/features/thanks/thanks-card.svelte";
    import LicensesList from "$lib/features/settings/components/licenses-list.svelte";
    import { settingsUi } from "$lib/features/settings/ui.svelte";
    import { aboutInfo } from "$lib/features/settings/about-info.svelte";
    import VersionCard from "$lib/features/settings/components/version-card.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const info = $derived(aboutInfo.info);
    let licensesOpen = $state(false);

    $effect(() => {
        if (settingsUi.query.trim() && show("licenses")) licensesOpen = true;
    });

    onMount(() => {
        void aboutInfo.load();
    });
</script>

{#if show("updates")}
    <Card as="section">
        <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
                <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.updates")}</h2>
                <p class="text-sm text-muted-foreground" aria-live="polite">{updateLine(updateSurface.source)}</p>
                <p class="text-xs text-muted-foreground">
                    {t("updates.channel.summary", { channel: t(`updates.channel.${updateSurface.channel}.name`) })}
                </p>
            </div>
            <Button
                size="sm"
                variant={indicatorKind(updateSurface.source) ? "default" : "outline"}
                onclick={() => updateSurface.show()}
            >
                {t("updates.overview.open")}
                <ChevronRight />
            </Button>
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

{#if show("whats-new") && info}
    <Card as="section">
        <button
            type="button"
            class="flex w-full items-center justify-between gap-3 text-left"
            onclick={() => goto(WHATS_NEW_ROUTE)}
        >
            <span class="font-heading text-sm font-semibold tracking-wide"
                >{t("settings.about_page.whats_new_in", { version: info.appVersion })}</span
            >
            <ChevronRight class="size-4 text-muted-foreground" />
        </button>
    </Card>
{/if}

{#if show("version")}
    <VersionCard />
{/if}

{#if show("thanks")}
    <ThanksCard />
{/if}

{#if show("licenses")}
    <details class="group" bind:open={licensesOpen}>
        <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <Card class="flex items-center justify-between gap-3 hover:bg-accent/40">
                <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.licenses")}</h2>
                <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            </Card>
        </summary>
        {#if licensesOpen}
            <div class="mt-4">
                <LicensesList />
            </div>
        {/if}
    </details>
{/if}
