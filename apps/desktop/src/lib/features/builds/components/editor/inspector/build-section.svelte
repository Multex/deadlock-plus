<script lang="ts">
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import { updateBuild } from "$lib/features/builds/editor/document";
    import { supportFooterText, type BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import {
        DESCRIPTION_MAX_CHARS,
        NAME_MAX_CHARS,
        languageOptions,
        standardTags,
        type NamedThing,
        type StandardTag,
    } from "$lib/features/builds/editor/details";
    import {
        footerCost,
        hasFooter,
        stripFooter,
        withFooter,
        writeSupportPreference,
    } from "$lib/features/builds/editor/support-footer";
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
    // The field holds the player's own text; the footer lives in the stored description so save, copy, drafts
    // and undo all carry it without a separate write-time step.
    const footer = $derived(supportFooterText());
    const support = $derived(hasFooter(build.description));
    const own = $derived(stripFooter(build.description));
    const written = $derived(build.description.slice(own.length).trim());
    const room = $derived(DESCRIPTION_MAX_CHARS - (support ? footerCost(footer) : 0));
    const tooLong = $derived(own.length > room);
    const publishable = $derived(!nameMissing && own.trim() !== "");

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

    function setSupport(on: boolean) {
        editor.apply(updateBuild(editor.build, { description: withFooter(editor.build.description, on, footer) }));
        void writeSupportPreference(on);
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
                {count(own, room)}
            </span>
        </div>
        <Textarea
            id="{id}-description"
            rows={4}
            value={own}
            maxlength={room}
            class="min-h-20"
            aria-describedby={support ? `${id}-footer` : undefined}
            oninput={(e) =>
                editor.apply(
                    updateBuild(editor.build, { description: withFooter(e.currentTarget.value, support, footer) }),
                    "build:description",
                )}
        />
        {#if support}
            <p
                id="{id}-footer"
                class="border-l-2 border-border pl-2 text-xs break-words whitespace-pre-wrap text-muted-foreground"
                data-testid="support-footer-preview"
            >
                {written}
            </p>
        {/if}
        {#if tooLong}
            <p class="text-xs text-warning">{t("builds.editor.details.description_too_long")}</p>
        {:else if !publishable}
            <p class="text-xs text-muted-foreground">{t("builds.editor.details.publish_needs")}</p>
        {/if}
    </div>

    <div class="flex items-center justify-between gap-2">
        <label for="{id}-support" class="text-xs font-medium">{t("builds.editor.details.support")}</label>
        <Switch id="{id}-support" checked={support} data-testid="build-support" onCheckedChange={setSupport} />
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
