<script lang="ts">
    import { onMount } from "svelte";
    import { Layers, RefreshCw, Search, ShieldOff } from "@lucide/svelte";

    import Button from "@deadlock-plus/ui/button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { createPoller } from "$lib/core/poller";

    import { ServerPicker } from "$lib/features/server-picker/picker.svelte";
    import AdminAccessDialog from "$lib/features/server-picker/components/admin-access-dialog.svelte";
    import ExternalBlocksBanner from "$lib/features/server-picker/components/external-blocks-banner.svelte";
    import GameRunningBanner from "$lib/features/server-picker/components/game-running-banner.svelte";
    import PresetsDialog from "$lib/features/server-picker/components/presets-dialog.svelte";
    import RegionList from "$lib/features/server-picker/components/region-list.svelte";
    import ServerListError from "$lib/features/server-picker/components/server-list-error.svelte";
    import SortHeader from "$lib/features/server-picker/components/sort-header.svelte";
    import UnsupportedBanner from "$lib/features/server-picker/components/unsupported-banner.svelte";

    const GAME_POLL_MS = 3000;

    const picker = new ServerPicker();

    onMount(() => {
        picker.init();
        void picker.refreshGameRunning();
        const onFocus = () => void picker.refreshGameRunning();
        window.addEventListener("focus", onFocus);
        const poller = createPoller(() => void picker.refreshGameRunning(), {
            intervalMs: GAME_POLL_MS,
            pauseWhenHidden: true,
        });
        poller.start();
        return () => {
            window.removeEventListener("focus", onFocus);
            poller.stop();
        };
    });
</script>

<Page>
    <PageHeader
        title={t("server_picker.title", { game: picker.gameDef?.displayName ?? "Deadlock" })}
        subtitle={t("server_picker.subtitle")}
    >
        {#snippet actions()}
            <Button variant="outline" size="sm" onclick={() => (picker.presetsOpen = true)} disabled={picker.loading}>
                <Layers />
                {t("server_picker.presets_button")}
            </Button>

            <Button
                variant="outline"
                size="sm"
                onclick={() => picker.pingAll()}
                disabled={picker.loading || picker.pinging}
            >
                <RefreshCw class={picker.pinging ? "animate-spin" : ""} />
                {t("server_picker.ping_button")}
            </Button>

            <Button
                variant="outline"
                size="sm"
                onclick={() => (picker.unblockAllOpen = true)}
                disabled={picker.blockedIds.size === 0}
            >
                <ShieldOff />
                {t("server_picker.unblock_all_button", { count: picker.blockedIds.size })}
            </Button>
        {/snippet}
    </PageHeader>

    {#if picker.gameRunning}
        <GameRunningBanner />
    {/if}

    {#if picker.capability && !picker.capability.supported}
        <UnsupportedBanner />
    {/if}

    {#if picker.externalIds.size > 0}
        <ExternalBlocksBanner
            ruleCount={picker.externalBlocks?.ruleNames.length ?? 0}
            regionCount={picker.externalIds.size}
            label={picker.externalLabel}
            importing={picker.importing}
            onImport={() => (picker.importOpen = true)}
        />
    {/if}

    <div class="relative">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
            bind:value={picker.search}
            placeholder={t("server_picker.filter_placeholder")}
            aria-label={t("server_picker.filter_aria")}
            class="pl-8"
        />
    </div>

    {#if picker.error}
        <ServerListError onretry={() => void picker.loadAll()} />
    {:else if picker.loading && !picker.serverData}
        <div role="status" class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("server_picker.loading")}
        </div>
    {:else}
        <SortHeader sort={picker.sort} onSort={(key) => picker.sortBy(key)} />
        <RegionList {picker} />
    {/if}
</Page>

<ConfirmDialog
    bind:open={picker.unblockAllOpen}
    title={t("server_picker.unblock_all.title")}
    description={tn("server_picker.unblock_all.description", picker.blockedIds.size)}
    confirmLabel={t("server_picker.unblock_all.confirm")}
    onconfirm={() => picker.unblockAll()}
/>

<ConfirmDialog
    bind:open={picker.importOpen}
    title={t("server_picker.import.title", { source: picker.externalLabel })}
    description={t("server_picker.import.description", { source: picker.externalLabel })}
    confirmLabel={t("server_picker.import.confirm")}
    onconfirm={() => picker.importExternal()}
/>

<PresetsDialog
    bind:open={picker.presetsOpen}
    presets={picker.presets}
    regions={picker.regions}
    currentlyBlockedRegionIds={picker.blockedRegionIds}
    onApply={(preset) => picker.applyPreset(preset)}
    onSave={(preset) => picker.savePreset(preset)}
    onDelete={(id) => picker.deletePreset(id)}
/>

<AdminAccessDialog prompt={picker.admin} />
