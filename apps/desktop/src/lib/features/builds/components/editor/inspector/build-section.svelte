<script lang="ts">
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import { updateBuild } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import {
        DESCRIPTION_MAX_CHARS,
        NAME_MAX_CHARS,
        languageOptions,
        standardTags,
        type NamedThing,
        type StandardTag,
    } from "$lib/features/builds/editor/details";
    import { loadBuildTags } from "$lib/features/gamedata/vdata";
    import TagSlots from "./tag-slots.svelte";

    let {
        editor,
        items,
        abilities,
        nameId,
        nameWanted = false,
    }: {
        editor: BuildEditor;
        items?: ReadonlyMap<number, NamedThing>;
        abilities?: ReadonlyMap<number, NamedThing>;
        nameId: string;
        /** Save to game was pressed without a name. */
        nameWanted?: boolean;
    } = $props();

    const id = $props.id();
    const build = $derived(editor.build);
    const nameMissing = $derived(build.name.trim() === "");
    const tooLong = $derived(build.description.length > DESCRIPTION_MAX_CHARS);
    const publishable = $derived(!nameMissing && build.description.trim() !== "");

    const languages = $derived(
        languageOptions(i18n.locale, build.language, (n) => t("builds.editor.details.language_unknown", { id: n })),
    );

    let standard = $state<StandardTag[]>(standardTags([]));
    $effect(() => {
        let live = true;
        void loadBuildTags(i18n.locale).then(
            (game) => live && (standard = standardTags(game)),
            () => {},
        );
        return () => {
            live = false;
        };
    });

    function setLanguage(value: string) {
        const language = Number(value);
        if (Number.isInteger(language) && language !== editor.build.language) {
            editor.apply(updateBuild(editor.build, { language }));
        }
    }

    const count = (value: string, max: number) => `${formatNumber(value.length)}/${formatNumber(max)}`;
</script>

<section class="flex flex-col gap-3" aria-labelledby="{id}-title" data-testid="inspector-build">
    <h2 id="{id}-title" class="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {t("builds.editor.inspector.build")}
    </h2>

    <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
            <label for={nameId} class="text-xs font-medium">{t("builds.editor.details.name")}</label>
            <span class="text-[11px] text-muted-foreground tabular-nums">{count(build.name, NAME_MAX_CHARS)}</span>
        </div>
        <Input
            id={nameId}
            value={build.name}
            maxlength={NAME_MAX_CHARS}
            autocomplete="off"
            placeholder={t("builds.editor.name_placeholder")}
            aria-invalid={nameWanted && nameMissing}
            data-testid="build-name"
            oninput={(e) => editor.apply(updateBuild(editor.build, { name: e.currentTarget.value }), "build:name")}
        />
        {#if nameWanted && nameMissing}
            <p class="text-xs text-destructive" role="alert">{t("builds.editor.name_needed")}</p>
        {/if}
    </div>

    <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
            <label for="{id}-description" class="text-xs font-medium">{t("builds.editor.details.description")}</label>
            <span class={["text-[11px] tabular-nums", tooLong ? "text-warning" : "text-muted-foreground"]}>
                {count(build.description, DESCRIPTION_MAX_CHARS)}
            </span>
        </div>
        <Textarea
            id="{id}-description"
            rows={4}
            value={build.description}
            maxlength={DESCRIPTION_MAX_CHARS}
            class="min-h-20"
            oninput={(e) =>
                editor.apply(updateBuild(editor.build, { description: e.currentTarget.value }), "build:description")}
        />
        {#if tooLong}
            <p class="text-xs text-warning">{t("builds.editor.details.description_too_long")}</p>
        {:else if !publishable}
            <p class="text-xs text-muted-foreground">{t("builds.editor.details.publish_needs")}</p>
        {/if}
    </div>

    <div class="flex flex-col gap-1.5">
        <span id="{id}-tags" class="text-xs font-medium">{t("builds.editor.details.tags")}</span>
        <TagSlots {editor} {standard} {items} {abilities} labelledby="{id}-tags" />
    </div>

    <div class="flex flex-col gap-1">
        <span id="{id}-language" class="text-xs font-medium">{t("builds.editor.details.language")}</span>
        <SelectMenu
            size="sm"
            aria-labelledby="{id}-language"
            items={languages}
            value={String(build.language)}
            onValueChange={setLanguage}
        />
    </div>
</section>
