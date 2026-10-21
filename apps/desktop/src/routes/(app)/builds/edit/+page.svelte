<script lang="ts">
    import { ArrowLeft, Info, LoaderCircle } from "@lucide/svelte";
    import { tick } from "svelte";
    import { toast } from "svelte-sonner";
    import { beforeNavigate } from "$app/navigation";
    import { page } from "$app/state";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { failureText } from "$lib/core/errors";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { buildsDrafts, buildsLocal } from "$lib/features/builds/api";
    import { chipFor, loadKit, loadPublic, type HeroKit } from "$lib/features/builds/build-detail.svelte";
    import { loadShopCatalog, type ShopCatalog } from "$lib/features/builds/catalog";
    import AbilityBar from "$lib/features/builds/components/editor/ability-bar.svelte";
    import CategoryMenu from "$lib/features/builds/components/editor/category-menu.svelte";
    import EditCanvas from "$lib/features/builds/components/editor/edit-canvas.svelte";
    import EditorToolbar from "$lib/features/builds/components/editor/editor-toolbar.svelte";
    import Inspector from "$lib/features/builds/components/editor/inspector/inspector.svelte";
    import { itemFieldId, type ItemField } from "$lib/features/builds/components/editor/inspector/item-section.svelte";
    import ItemMenu from "$lib/features/builds/components/editor/item-menu.svelte";
    import ShopRail from "$lib/features/builds/components/editor/shop/shop-rail.svelte";
    import SoulsTimeline from "$lib/features/builds/components/editor/souls-timeline.svelte";
    import { addCategory, type ItemRef } from "$lib/features/builds/editor/document";
    import { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import { loadEditSession, parseEditTarget, protoLanguage } from "$lib/features/builds/editor/load";
    import { LOCAL_ID_LIMIT } from "$lib/features/builds/my-builds";
    import { MEASURED_RESOLUTION, SHOP_SCREENS, type ShopResolution } from "$lib/features/builds/shop-view";
    import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";

    const target = $derived(parseEditTarget(page.url.searchParams));

    let status = $state<"loading" | "missing" | "failed" | "ready">("loading");
    let error = $state<string | null>(null);
    let editor = $state.raw<BuildEditor | null>(null);
    let catalog = $state.raw<ShopCatalog | null>(null);
    let catalogFailed = $state(false);
    let kit = $state.raw<HeroKit | null>(null);
    let hero = $state.raw<Hero | null>(null);
    let resolution = $state<ShopResolution>(MEASURED_RESOLUTION);
    const screen = $derived(SHOP_SCREENS[resolution]);
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

    const focusName = () => document.getElementById(NAME_ID)?.focus();

    $effect(() => {
        if (status === "ready" && nameMissing) focusName();
    });

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

    let renaming = $state<number | null>(null);

    function startRename(index: number) {
        if (editor) editor.activeCategory = index;
        renaming = index;
    }

    function newCategory() {
        if (!editor) return;
        const index = editor.build.modCategories.length;
        editor.apply(addCategory(editor.build, index, t("builds.editor.new_category")));
        editor.select([], "replace");
        startRename(index);
    }

    async function focusField(element: () => HTMLElement | null) {
        await tick();
        element()?.focus();
    }

    function describeCategory(index: number) {
        if (!editor) return;
        editor.activeCategory = index;
        void focusField(() => document.querySelector<HTMLElement>('[data-testid="category-description"]'));
    }

    function itemDetails(ref: ItemRef, field: ItemField) {
        if (!editor) return;
        editor.select([ref], "replace");
        void focusField(() => document.getElementById(itemFieldId(field)));
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

{#snippet loading()}
    <EmptyState aria-busy="true">
        <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.editor.loading")} />
    </EmptyState>
{/snippet}

<div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center gap-2.5 border-b border-border px-3 py-1.5" data-testid="editor-bar">
        <a
            href="/builds"
            class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t("builds.editor.back")}
        >
            <ArrowLeft class="size-4" aria-hidden="true" />
        </a>
        {#if editor && build}
            <span class="size-7 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {#if hero?.icon}
                    <img src={hero.icon} alt={hero.name} class="size-full object-cover" />
                {/if}
            </span>
            <h1 class="min-w-0 truncate text-sm font-semibold" data-testid="editor-title">
                {build.name.trim() || t("builds.editor.name_placeholder")}
            </h1>
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

        <div class="flex min-h-0 flex-1">
            <Inspector
                {editor}
                byId={catalog?.byId}
                {kit}
                {screen}
                nameId={NAME_ID}
                {nameWanted}
                onSplit={startRename}
            />

            <!-- The rail's flyout is absolutely placed over the canvas column, so this box spans both. -->
            <div class="relative flex min-w-0 flex-1">
                {#if catalog}
                    <ShopRail {editor} {catalog} statsById={catalog.statsById} heroId={build.heroId} />
                {/if}
                <div class="flex min-w-0 flex-1 flex-col">
                    <EditorToolbar
                        {editor}
                        bind:resolution
                        resolve={catalog ? (id) => chipFor(catalog!.byId, id) : undefined}
                        onAddCategory={newCategory}
                        onSave={() => void save()}
                    />
                    <div class="min-h-0 flex-1 overflow-auto p-4" data-testid="editor-canvas-scroll">
                        {#if catalog}
                            {@const byId = catalog.byId}
                            {@const active = editor}
                            <EditCanvas {editor} {screen} bind:renaming resolve={(id) => chipFor(byId, id)}>
                                {#snippet categoryMenu(index: number)}
                                    <CategoryMenu
                                        editor={active}
                                        {index}
                                        {byId}
                                        {screen}
                                        onRename={() => startRename(index)}
                                        onDescribe={() => describeCategory(index)}
                                        onSplit={startRename}
                                    />
                                {/snippet}
                                {#snippet itemMenu(ref: ItemRef, at: { x: number; y: number })}
                                    <ItemMenu
                                        editor={active}
                                        {ref}
                                        {byId}
                                        open
                                        anchor={at}
                                        onDetails={(field) => itemDetails(ref, field)}
                                        onSplit={startRename}
                                    />
                                {/snippet}
                            </EditCanvas>
                        {:else if catalogFailed}
                            <EmptyState tone="destructive" role="alert">{t("builds.editor.catalog_failed")}</EmptyState>
                        {:else}
                            {@render loading()}
                        {/if}
                    </div>
                    {#if catalog && kit}
                        <SoulsTimeline {editor} {catalog} statsById={catalog.statsById} {kit} levels={kit.levels} />
                    {/if}
                    {#if kit}
                        <AbilityBar {editor} {kit} />
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
