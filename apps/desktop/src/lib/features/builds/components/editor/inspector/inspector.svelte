<script lang="ts">
    import type { Screen } from "@deadlock-plus/build-layout";
    import { t } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "$lib/features/builds/build-detail.svelte";
    import type { ShopItem } from "$lib/features/builds/catalog";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import BuildSection from "./build-section.svelte";
    import CategorySection from "./category-section.svelte";
    import ItemSection from "./item-section.svelte";

    let {
        editor,
        byId,
        kit,
        screen,
        nameId,
        nameWanted = false,
        onSplit,
    }: {
        editor: BuildEditor;
        byId?: ReadonlyMap<number, ShopItem>;
        kit?: HeroKit | null;
        screen: Screen;
        nameId: string;
        nameWanted?: boolean;
        onSplit?: (index: number) => void;
    } = $props();

    const abilities = $derived(kit ? [...kit.abilities.values()] : []);
</script>

<aside
    class="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/40"
    aria-label={t("builds.editor.inspector.label")}
    data-testid="inspector"
>
    <div class="p-4">
        <BuildSection {editor} items={byId} abilities={kit?.abilities} {nameId} {nameWanted} />
    </div>
    <div class="border-t border-border p-4">
        <CategorySection {editor} {byId} {screen} {onSplit} />
    </div>
    <div class="border-t border-border p-4">
        <ItemSection {editor} {byId} {abilities} />
    </div>
</aside>
