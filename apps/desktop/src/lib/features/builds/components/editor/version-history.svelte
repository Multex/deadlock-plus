<script lang="ts">
    import { History, LoaderCircle } from "@lucide/svelte";
    import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { failureText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import { buildsHistory, buildsHistoryGet } from "../../api";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import { ageOf, historyBuildId, restoredBuild, versionRows, type VersionRow } from "../../editor/history-versions";
    import { SHOP_SCREENS, type ChipItem } from "../../shop-view";
    import ShopGrid from "../shop/shop-grid.svelte";

    let {
        editor,
        resolve,
    }: {
        editor: BuildEditor;
        resolve: (abilityId: number) => ChipItem | undefined;
    } = $props();

    const buildId = $derived(historyBuildId(editor.origin));

    let open = $state(false);
    let metas = $state.raw<BuildVersionMeta[] | null>(null);
    let loaded = $state.raw<Map<string, BuildView>>(new Map());
    let failed = $state.raw<Set<string>>(new Set());
    let error = $state<string | null>(null);
    let picked = $state<string | null>(null);
    let nowS = $state(0);

    const rows = $derived(metas ? versionRows(metas, loaded, editor.build) : []);
    const preview = $derived(picked ? loaded.get(picked) : undefined);

    $effect(() => {
        if (!open || buildId === null) return;
        const id = buildId;
        let live = true;
        metas = null;
        loaded = new Map();
        failed = new Set();
        error = null;
        picked = null;
        nowS = Math.floor(Date.now() / 1000);
        void (async () => {
            try {
                const listed = await buildsHistory(id);
                if (!live) return;
                metas = listed;
                picked = versionRows(listed, loaded, editor.build)[0]?.id ?? null;
                // At most 20 versions, read from local files: loading them all gives every row its item count.
                await Promise.all(
                    listed.map(async (meta) => {
                        try {
                            const version = await buildsHistoryGet(id, meta.id);
                            if (live) loaded = new Map(loaded).set(meta.id, version);
                        } catch {
                            if (live) failed = new Set(failed).add(meta.id);
                        }
                    }),
                );
            } catch (e) {
                if (live) error = failureText(e, t("builds.editor.history.load_failed"));
            }
        })();
        return () => {
            live = false;
        };
    });

    function ageText(row: VersionRow): string {
        const age = ageOf(row.savedAt, nowS);
        return age.unit === "now"
            ? t("builds.editor.history.age_now")
            : tn(`builds.editor.history.age_${age.unit}`, age.count);
    }

    const absolute = (savedAt: number) => formatDate(savedAt * 1000, { dateStyle: "medium", timeStyle: "short" });

    function restore() {
        if (!preview) return;
        editor.apply(restoredBuild(editor.build, preview));
        open = false;
    }
</script>

{#if buildId !== null}
    <Button variant="outline" size="sm" data-testid="editor-history" onclick={() => (open = true)}>
        <History aria-hidden="true" />
        {t("builds.editor.history.open")}
    </Button>
    <Dialog.Root bind:open>
        <Dialog.Content class="max-w-3xl" data-testid="version-history">
            <Dialog.Title>{t("builds.editor.history.title")}</Dialog.Title>
            {#if error}
                <EmptyState tone="destructive" role="alert">{error}</EmptyState>
            {:else if metas === null}
                <EmptyState aria-busy="true">
                    <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.editor.loading")} />
                </EmptyState>
            {:else if rows.length === 0}
                <EmptyState>{t("builds.editor.history.empty")}</EmptyState>
            {:else}
                <div class="flex min-h-0 gap-4">
                    <ul
                        class="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto"
                        aria-label={t("builds.editor.history.list")}
                    >
                        {#each rows as row (row.id)}
                            <li>
                                <Button
                                    variant="toggle"
                                    size="sm"
                                    class="h-auto w-full flex-col items-start gap-0.5 py-1.5 text-left"
                                    aria-pressed={picked === row.id}
                                    data-testid="history-version"
                                    onclick={() => (picked = row.id)}
                                >
                                    <span title={absolute(row.savedAt)}>{ageText(row)}</span>
                                    {#if row.name !== null || row.items !== null}
                                        <span class="w-full truncate text-xs text-muted-foreground">
                                            {[
                                                row.name,
                                                row.items !== null
                                                    ? tn("builds.editor.history.items", row.items)
                                                    : null,
                                            ]
                                                .filter((part) => part !== null)
                                                .join(" · ")}
                                        </span>
                                    {/if}
                                </Button>
                            </li>
                        {/each}
                    </ul>
                    <div class="flex min-w-0 flex-1 flex-col gap-3">
                        {#if preview}
                            <div class="max-h-96 overflow-y-auto">
                                <ShopGrid build={preview} {resolve} screen={SHOP_SCREENS["1440"]} mode="fit" />
                            </div>
                            <div class="flex items-center justify-between gap-2">
                                <p class="text-xs text-muted-foreground">{t("builds.editor.history.restore_note")}</p>
                                <Button size="sm" data-testid="history-restore" onclick={restore}>
                                    {t("builds.editor.history.restore")}
                                </Button>
                            </div>
                        {:else if picked && failed.has(picked)}
                            <EmptyState tone="destructive" role="alert">
                                {t("builds.editor.history.version_failed")}
                            </EmptyState>
                        {:else if picked}
                            <EmptyState aria-busy="true">
                                <LoaderCircle
                                    class="mx-auto size-5 animate-spin"
                                    aria-label={t("builds.editor.loading")}
                                />
                            </EmptyState>
                        {/if}
                    </div>
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
{/if}
