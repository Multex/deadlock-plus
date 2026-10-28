<script lang="ts">
    import { onMount } from "svelte";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { createPoller } from "$lib/core/poller";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";

    import AddMuteCard from "$lib/features/voice-bans/components/add-mute-card.svelte";
    import FilterBar from "$lib/features/voice-bans/components/filter-bar.svelte";
    import GameRunningBanner from "$lib/features/voice-bans/components/game-running-banner.svelte";
    import ListError from "$lib/features/voice-bans/components/list-error.svelte";
    import HeaderActions from "$lib/features/voice-bans/components/header-actions.svelte";
    import MutedList from "$lib/features/voice-bans/components/muted-list.svelte";
    import Pager from "$lib/features/voice-bans/components/pager.svelte";
    import { Mutes } from "$lib/features/voice-bans/mutes.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const POLL_MS = 3000;

    const m = new Mutes();
    const accountLabel = $derived(steamAccount.account?.personaName ?? t("voice_bans.your_account"));

    onMount(() => {
        void m.load();
        const onFocus = () => void m.load();
        window.addEventListener("focus", onFocus);
        const poller = createPoller(() => void m.load(), { intervalMs: POLL_MS, pauseWhenHidden: true });
        poller.start();
        return () => {
            window.removeEventListener("focus", onFocus);
            poller.stop();
        };
    });
</script>

<Page>
    <PageHeader title={t("voice_bans.title")} subtitle={t("voice_bans.subtitle", { account: accountLabel })}>
        {#snippet actions()}
            <HeaderActions
                importDisabled={m.busy || m.locked || !m.file?.exists}
                exportDisabled={m.muted.length === 0}
                exportLabel={m.selected.size > 0
                    ? t("voice_bans.export_selected", { count: m.selected.size })
                    : t("voice_bans.export_all")}
                onimport={(f) => m.importFile(f)}
                onexport={() => m.exportList(m.selected.size > 0 ? [...m.selected] : m.muted)}
            />
        {/snippet}
    </PageHeader>

    {#if m.locked}
        <GameRunningBanner />
    {/if}

    {#if m.noAccount}
        <EmptyState as="div" layout="fill">
            {t("errors.voice_bans.no_account")}
        </EmptyState>
    {:else if m.error}
        <ListError onretry={() => void m.load()} />
    {:else if m.loading && !m.file}
        <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("voice_bans.reading")}
        </div>
    {:else if m.file && !m.file.exists}
        <EmptyState as="div" layout="fill">
            {t("voice_bans.no_file")}
        </EmptyState>
    {:else if m.file}
        <AddMuteCard
            bind:value={m.addInput}
            results={m.searchResults}
            mutedSet={m.mutedSet}
            busy={m.busy}
            locked={m.locked}
            searching={m.searching}
            onsubmit={() => m.submitAdd()}
            onmute={(id) => m.mute([id])}
            onopen={(id) => m.openStatlocker(id)}
        />
        <FilterBar
            bind:value={m.filter}
            selectedCount={m.selected.size}
            disabled={m.busy || m.locked}
            onunmute={() => m.askUnmute([...m.selected])}
        />
        <MutedList
            visible={m.visible}
            profiles={m.profiles}
            selected={m.selected}
            allSelected={m.allVisibleSelected}
            filteredCount={m.filtered.length}
            totalCount={m.muted.length}
            filter={m.filter}
            disabled={m.busy || m.locked}
            ontoggleall={(on) => m.toggleVisible(on)}
            ontoggle={(id, on) => m.toggle(id, on)}
            onopen={(id) => m.openStatlocker(id)}
            onunmute={(id) => m.askUnmute([id])}
        />
        {#if m.pageCount > 1}
            <Pager bind:page={m.page} pageCount={m.pageCount} />
        {/if}
    {/if}
</Page>

<ConfirmDialog
    bind:open={m.unmuteOpen}
    title={tn("voice_bans.unmute.title", m.unmuteIds.length)}
    description={t("voice_bans.unmute.description")}
    confirmLabel={t("voice_bans.unmute.confirm")}
    disabled={m.locked}
    onconfirm={() => m.confirmUnmute()}
/>

<ConfirmDialog
    bind:open={m.importOpen}
    title={tn("voice_bans.import_dialog.title", m.newImportIds.length)}
    description={tn("voice_bans.import_dialog.description", m.importIds.length, {
        already: m.importIds.length - m.newImportIds.length,
    })}
    confirmLabel={t("voice_bans.import_dialog.confirm")}
    disabled={m.newImportIds.length === 0 || m.locked}
    onconfirm={() => m.mute(m.newImportIds)}
/>
