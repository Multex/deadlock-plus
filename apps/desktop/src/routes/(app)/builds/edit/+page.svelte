<script lang="ts">
    import { ArrowLeft, Check, Clock, Info, LoaderCircle, Redo2, Save, TriangleAlert, Undo2 } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { beforeNavigate } from "$app/navigation";
    import { page } from "$app/state";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";
    import { failureText } from "$lib/core/errors";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { buildsDrafts, buildsLocal } from "$lib/features/builds/api";
    import { chipFor, loadKit, loadPublic, type HeroKit } from "$lib/features/builds/build-detail.svelte";
    import { loadShopCatalog, type ShopCatalog } from "$lib/features/builds/catalog";
    import AbilityEditor from "$lib/features/builds/components/editor/ability-editor.svelte";
    import CategoryMenu from "$lib/features/builds/components/editor/category-menu.svelte";
    import DetailsPanel from "$lib/features/builds/components/editor/details-panel.svelte";
    import EditCanvas from "$lib/features/builds/components/editor/edit-canvas.svelte";
    import ItemMenu from "$lib/features/builds/components/editor/item-menu.svelte";
    import ItemPicker from "$lib/features/builds/components/editor/item-picker.svelte";
    import { updateBuild, type ItemRef } from "$lib/features/builds/editor/document";
    import { BuildEditor, type SaveStatus } from "$lib/features/builds/editor/editor.svelte";
    import { loadEditSession, parseEditTarget, protoLanguage } from "$lib/features/builds/editor/load";
    import { LOCAL_ID_LIMIT } from "$lib/features/builds/my-builds";
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";

    const target = $derived(parseEditTarget(page.url.searchParams));

    let status = $state<"loading" | "missing" | "failed" | "ready">("loading");
    let error = $state<string | null>(null);
    let editor = $state.raw<BuildEditor | null>(null);
    let catalog = $state.raw<ShopCatalog | null>(null);
    let catalogFailed = $state(false);
    let kit = $state.raw<HeroKit | null>(null);
    let hero = $state.raw<Hero | null>(null);
    let tab = $state("items");
    const NAME_ID = "editor-build-name";
    let nameWanted = $state(false);

    $effect(() => {
        const wanted = target;
        let live = true;
        let opened: BuildEditor | null = null;
        status = "loading";
        editor = null;
        catalog = null;
        catalogFailed = false;
        kit = null;
        hero = null;
        if (!wanted) {
            status = "missing";
            return;
        }
        void (async () => {
            try {
                const session = await loadEditSession(wanted, {
                    local: buildsLocal,
                    drafts: buildsDrafts,
                    published: async (id) => (await loadPublic(id))?.build ?? null,
                    language: protoLanguage(i18n.locale),
                    copyName: (name) => t("builds.mine.copy_name", { name }),
                    categoryName: t("builds.editor.first_category"),
                });
                if (!live) return;
                if (!session) {
                    status = "missing";
                    return;
                }
                opened = new BuildEditor(session);
                editor = opened;
                status = "ready";
                const heroId = session.build.heroId;
                void loadShopCatalog(i18n.locale).then(
                    (loaded) => live && (catalog = loaded),
                    () => live && (catalogFailed = true),
                );
                void loadKit(heroId).then(
                    (loaded: HeroKit) => live && (kit = loaded),
                    () => {},
                );
                void loadHeroes([heroId]).then(
                    (heroes) => live && (hero = heroes[heroId] ?? null),
                    () => {},
                );
            } catch (e) {
                if (!live) return;
                error = failureText(e, t("builds.editor.load_failed"));
                status = "failed";
            }
        })();
        return () => {
            live = false;
            if (opened) {
                void opened.flushDraft();
                opened.dispose();
            }
        };
    });

    beforeNavigate(() => {
        void editor?.flushDraft();
    });

    const build = $derived(editor?.build ?? null);
    const published = $derived(
        editor?.origin.kind === "local" && editor.origin.buildId >= LOCAL_ID_LIMIT && build !== null,
    );
    const nameMissing = $derived(build !== null && build.name.trim() === "");

    type EditStatus = SaveStatus | "draft_failed";
    const TONES: Record<EditStatus, "muted" | "warning" | "success"> = {
        saving: "muted",
        queued: "warning",
        conflict: "warning",
        saved: "success",
        unsaved: "muted",
        draft: "muted",
        draft_failed: "warning",
    };

    const editStatus = $derived.by((): EditStatus | null => {
        if (!editor) return null;
        const status = editor.status;
        return status === "unsaved" && editor.dirty && editor.draftError ? "draft_failed" : status;
    });
    const statusLine = $derived(
        editStatus ? { text: t(`builds.editor.status_${editStatus}`), tone: TONES[editStatus] } : null,
    );

    const focusName = () => document.getElementById(NAME_ID)?.focus();

    $effect(() => {
        if (status === "ready" && nameMissing) focusName();
    });

    function rename(name: string) {
        if (editor) editor.apply(updateBuild(editor.build, { name }), "build-name");
    }

    async function save() {
        if (!editor || editor.saving) return;
        if (nameMissing) {
            nameWanted = true;
            focusName();
            return;
        }
        try {
            const result = await editor.saveToGame();
            if (result.kind === "conflict") toast.error(t("builds.mine.changed_in_game"));
        } catch (e) {
            toast.error(failureText(e, t("builds.editor.save_failed")));
        }
    }

    const abilities = $derived(kit ? [...kit.abilities.values()] : []);
    let renaming = $state<number | null>(null);

    function startRename(index: number) {
        if (editor) editor.activeCategory = index;
        renaming = index;
    }

    const editable = (el: EventTarget | null) =>
        el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

    function onKey(event: KeyboardEvent) {
        if (!editor || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === "s") {
            event.preventDefault();
            void save();
            return;
        }
        // Text fields keep their own undo.
        if (editable(event.target)) return;
        if (key === "z" && !event.shiftKey) {
            event.preventDefault();
            editor.undo();
        } else if ((key === "z" && event.shiftKey) || key === "y") {
            event.preventDefault();
            editor.redo();
        }
    }
</script>

<svelte:window onkeydown={onKey} />

<div class="flex h-full min-h-0 flex-col">
    <header class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5" data-testid="editor-bar">
        <a
            href="/builds"
            class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label={t("builds.editor.back")}
        >
            <ArrowLeft class="size-4" aria-hidden="true" />
        </a>

        {#if editor && build}
            <span class="size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {#if hero?.icon}
                    <img src={hero.icon} alt={hero.name} class="size-full object-cover" />
                {/if}
            </span>
            <div class="flex min-w-0 flex-1 flex-col">
                <Input
                    id={NAME_ID}
                    value={build.name}
                    class="h-8 max-w-md border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input focus-visible:border-input"
                    placeholder={t("builds.editor.name_placeholder")}
                    aria-label={t("builds.editor.name_label")}
                    aria-invalid={nameWanted && nameMissing}
                    data-testid="build-name"
                    oninput={(e) => rename(e.currentTarget.value)}
                />
                {#if nameWanted && nameMissing}
                    <p class="px-1.5 text-xs text-destructive" role="alert">{t("builds.editor.name_needed")}</p>
                {:else if statusLine}
                    <p
                        class={[
                            "flex items-center gap-1 px-1.5 text-xs",
                            statusLine.tone === "warning" && "text-warning",
                            statusLine.tone === "success" && "text-success",
                            statusLine.tone === "muted" && "text-muted-foreground",
                        ]}
                        role="status"
                        data-testid="editor-status"
                        data-state={editStatus}
                    >
                        {#if editor.saving}
                            <LoaderCircle class="size-3 animate-spin" aria-hidden="true" />
                        {:else if statusLine.tone === "warning"}
                            {#if editStatus === "queued"}
                                <Clock class="size-3" aria-hidden="true" />
                            {:else}
                                <TriangleAlert class="size-3" aria-hidden="true" />
                            {/if}
                        {:else if statusLine.tone === "success"}
                            <Check class="size-3" aria-hidden="true" />
                        {/if}
                        {statusLine.text}
                    </p>
                {/if}
            </div>

            <div class="flex items-center gap-1">
                <IconButton
                    label={t("builds.editor.undo")}
                    tooltip={t("builds.editor.undo_tooltip")}
                    aria-keyshortcuts="Control+Z"
                    disabled={!editor.canUndo}
                    data-testid="editor-undo"
                    onclick={() => editor?.undo()}
                >
                    <Undo2 aria-hidden="true" />
                </IconButton>
                <IconButton
                    label={t("builds.editor.redo")}
                    tooltip={t("builds.editor.redo_tooltip")}
                    aria-keyshortcuts="Control+Shift+Z Control+Y"
                    disabled={!editor.canRedo}
                    data-testid="editor-redo"
                    onclick={() => editor?.redo()}
                >
                    <Redo2 aria-hidden="true" />
                </IconButton>
                <Button
                    class="ml-2"
                    disabled={editor.saving}
                    aria-keyshortcuts="Control+S"
                    data-testid="save-to-game"
                    onclick={() => void save()}
                >
                    {#if editor.saving}
                        <LoaderCircle class="animate-spin" aria-hidden="true" />
                    {:else}
                        <Save aria-hidden="true" />
                    {/if}
                    {t("builds.editor.save")}
                </Button>
            </div>
        {/if}
    </header>

    {#if status === "loading"}
        <EmptyState size="base" spacing="xl" aria-busy="true">
            <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.editor.loading")} />
        </EmptyState>
    {:else if status === "failed"}
        <EmptyState size="base" spacing="xl" tone="destructive" role="alert">{error}</EmptyState>
    {:else if status === "missing"}
        <EmptyState size="base" spacing="xl" role="alert" data-testid="editor-missing">
            {t("builds.editor.missing")}
        </EmptyState>
    {:else if editor && build}
        {#if published}
            <p
                class="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground"
                role="note"
                data-testid="publish-note"
            >
                <Info class="size-3.5 shrink-0" aria-hidden="true" />
                {t("builds.editor.publish_note")}
            </p>
        {/if}

        <Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
            <div class="px-4 pt-3">
                <Tabs.List>
                    <Tabs.Trigger value="items">{t("builds.editor.tab_items")}</Tabs.Trigger>
                    <Tabs.Trigger value="abilities">{t("builds.editor.tab_abilities")}</Tabs.Trigger>
                    <Tabs.Trigger value="details">{t("builds.editor.tab_details")}</Tabs.Trigger>
                </Tabs.List>
            </div>
            <Tabs.Content value="items" class="mt-3 flex min-h-0 flex-1">
                <div class="min-w-0 flex-1 overflow-auto px-4 pb-6">
                    {#if catalog}
                        {@const byId = catalog.byId}
                        {@const active = editor}
                        <EditCanvas {editor} bind:renaming resolve={(id) => chipFor(byId, id)}>
                            {#snippet categoryMenu(index: number)}
                                <CategoryMenu
                                    editor={active}
                                    {index}
                                    {byId}
                                    onRename={() => startRename(index)}
                                    onSplit={startRename}
                                />
                            {/snippet}
                            {#snippet itemMenu(ref: ItemRef, at: { x: number; y: number })}
                                <ItemMenu
                                    editor={active}
                                    {ref}
                                    {byId}
                                    {abilities}
                                    open
                                    anchor={at}
                                    onSplit={startRename}
                                />
                            {/snippet}
                        </EditCanvas>
                    {:else if catalogFailed}
                        <EmptyState tone="destructive" role="alert">{t("builds.editor.catalog_failed")}</EmptyState>
                    {:else}
                        <EmptyState aria-busy="true">
                            <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.editor.loading")} />
                        </EmptyState>
                    {/if}
                </div>
                {#if catalog}
                    <div class="sticky top-0 h-full shrink-0">
                        <ItemPicker {editor} {catalog} statsById={catalog.statsById} />
                    </div>
                {/if}
            </Tabs.Content>
            <Tabs.Content value="abilities" class="mt-3 min-h-0 flex-1 overflow-auto px-4 pb-6">
                {#if kit}
                    <AbilityEditor {editor} {kit} />
                {:else}
                    <EmptyState aria-busy="true">
                        <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.editor.loading")} />
                    </EmptyState>
                {/if}
            </Tabs.Content>
            <Tabs.Content value="details" class="mt-3 min-h-0 flex-1 overflow-auto px-4 pb-6">
                <DetailsPanel {editor} items={catalog?.byId} abilities={kit?.abilities} />
            </Tabs.Content>
        </Tabs.Root>
    {/if}
</div>
