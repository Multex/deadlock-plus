<script lang="ts">
    import { X } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import { updateBuild } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import {
        DESCRIPTION_MAX_CHARS,
        NAME_MAX_CHARS,
        STANDARD_TAGS,
        TAG_SLOTS,
        buildItemIds,
        canAddTag,
        describeTag,
        languageOptions,
        selectedTags,
        toggleTag,
        type NamedThing,
        type TagInfo,
    } from "$lib/features/builds/editor/details";

    let {
        editor,
        items,
        abilities,
    }: {
        editor: BuildEditor;
        /** Names item tags; usually the shop catalog's `byId`. */
        items?: ReadonlyMap<number, NamedThing>;
        /** The hero's abilities in slot order; names ability tags and offers them in the picker. */
        abilities?: ReadonlyMap<number, NamedThing>;
    } = $props();

    const id = $props.id();
    const build = $derived(editor.build);

    const languages = $derived(
        languageOptions(i18n.locale, build.language, (n) => t("builds.editor.details.language_unknown", { id: n })),
    );

    const names = $derived({ items, abilities });
    const chosen = $derived(selectedTags(build.tags).map((tag) => describeTag(tag, names)));
    const chosenIds = $derived(new Set(selectedTags(build.tags)));
    const roomForMore = $derived(canAddTag(build.tags));
    const abilityTags = $derived([...(abilities?.keys() ?? [])].map((a) => describeTag(a, names)));
    const itemTags = $derived(
        items ? buildItemIds(build).flatMap((i) => (items.has(i) ? [describeTag(i, names)] : [])) : [],
    );

    const publishable = $derived(build.name.trim() !== "" && build.description.trim() !== "");

    function tagLabel(tag: TagInfo): string {
        switch (tag.kind) {
            case "standard":
                return t(`builds.editor.details.tag_${tag.key}`);
            case "ability":
            case "item":
                return tag.name;
            case "unknown":
                return t("builds.editor.details.tag_unknown", { id: tag.id });
        }
    }

    const art = (tag: TagInfo) => (tag.kind === "ability" || tag.kind === "item" ? tag.art : undefined);

    function setName(value: string) {
        editor.apply(updateBuild(editor.build, { name: value }), "details:name");
    }

    function setDescription(value: string) {
        editor.apply(updateBuild(editor.build, { description: value }), "details:description");
    }

    function setLanguage(value: string) {
        const language = Number(value);
        if (Number.isInteger(language) && language !== editor.build.language) {
            editor.apply(updateBuild(editor.build, { language }));
        }
    }

    function toggle(tag: number) {
        const next = toggleTag(editor.build.tags, tag);
        if (next !== editor.build.tags) editor.apply(updateBuild(editor.build, { tags: next }));
    }

    const count = (value: string, max: number) => `${formatNumber(value.length)}/${formatNumber(max)}`;
</script>

{#snippet tagButton(tag: TagInfo)}
    {@const pressed = chosenIds.has(tag.id)}
    {@const src = art(tag)}
    <Button
        variant="toggle"
        size="sm"
        aria-pressed={pressed}
        disabled={!pressed && !roomForMore}
        onclick={() => toggle(tag.id)}
    >
        {#if src}
            <img {src} alt="" class="size-5 rounded-sm object-cover" />
        {/if}
        {tagLabel(tag)}
    </Button>
{/snippet}

<div class="flex max-w-3xl flex-col gap-4" data-testid="details-panel">
    <Card as="section" class="flex flex-col gap-4" aria-labelledby="{id}-details">
        <h2 id="{id}-details" class="text-lg font-semibold">{t("builds.editor.details.title")}</h2>

        <div class="flex flex-col gap-1.5">
            <div class="flex items-baseline justify-between gap-2">
                <label for="{id}-name" class="text-sm font-medium">{t("builds.editor.details.name")}</label>
                <span class="text-xs tabular-nums text-muted-foreground">{count(build.name, NAME_MAX_CHARS)}</span>
            </div>
            <Input
                id="{id}-name"
                value={build.name}
                maxlength={NAME_MAX_CHARS}
                autocomplete="off"
                oninput={(e) => setName(e.currentTarget.value)}
            />
        </div>

        <div class="flex flex-col gap-1.5">
            <div class="flex items-baseline justify-between gap-2">
                <label for="{id}-description" class="text-sm font-medium">
                    {t("builds.editor.details.description")}
                </label>
                <span
                    class="text-xs tabular-nums {build.description.length > DESCRIPTION_MAX_CHARS
                        ? 'text-warning'
                        : 'text-muted-foreground'}"
                >
                    {count(build.description, DESCRIPTION_MAX_CHARS)}
                </span>
            </div>
            <Textarea
                id="{id}-description"
                rows={7}
                value={build.description}
                maxlength={DESCRIPTION_MAX_CHARS}
                oninput={(e) => setDescription(e.currentTarget.value)}
            />
            {#if build.description.length > DESCRIPTION_MAX_CHARS}
                <p class="text-xs text-warning">{t("builds.editor.details.description_too_long")}</p>
            {/if}
        </div>

        {#if !publishable}
            <p class="text-xs text-muted-foreground">{t("builds.editor.details.publish_needs")}</p>
        {/if}

        <div class="flex flex-col gap-1.5">
            <span id="{id}-language" class="text-sm font-medium">{t("builds.editor.details.language")}</span>
            <SelectMenu
                class="w-64"
                aria-labelledby="{id}-language"
                items={languages}
                value={String(build.language)}
                onValueChange={setLanguage}
            />
        </div>
    </Card>

    <Card as="section" class="flex flex-col gap-4" aria-labelledby="{id}-tags">
        <div class="flex items-baseline justify-between gap-2">
            <h2 id="{id}-tags" class="text-lg font-semibold">{t("builds.editor.details.tags")}</h2>
            <span class="text-xs tabular-nums text-muted-foreground">
                {formatNumber(chosen.length)}/{formatNumber(TAG_SLOTS)}
            </span>
        </div>

        {#if chosen.length > 0}
            <ul class="flex flex-wrap gap-2" aria-label={t("builds.editor.details.tags_chosen")}>
                {#each chosen as tag (tag.id)}
                    {@const src = art(tag)}
                    <li>
                        <Button
                            variant="toggle"
                            size="sm"
                            aria-pressed="true"
                            aria-label={t("builds.editor.details.tag_remove", { name: tagLabel(tag) })}
                            onclick={() => toggle(tag.id)}
                        >
                            {#if src}
                                <img {src} alt="" class="size-5 rounded-sm object-cover" />
                            {/if}
                            {tagLabel(tag)}
                            <X aria-hidden="true" />
                        </Button>
                    </li>
                {/each}
            </ul>
        {/if}

        {#if !roomForMore}
            <p class="text-xs text-muted-foreground">{t("builds.editor.details.tags_full", { count: TAG_SLOTS })}</p>
        {/if}

        <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">{t("builds.editor.details.tags_standard")}</h3>
            <div class="flex flex-wrap gap-2">
                {#each STANDARD_TAGS as standard (standard.id)}
                    {@render tagButton({ id: standard.id, kind: "standard", key: standard.key })}
                {/each}
            </div>
        </div>

        {#if abilityTags.length > 0}
            <div class="flex flex-col gap-2">
                <h3 class="text-sm font-medium">{t("builds.editor.details.tags_abilities")}</h3>
                <div class="flex flex-wrap gap-2">
                    {#each abilityTags as tag (tag.id)}
                        {@render tagButton(tag)}
                    {/each}
                </div>
            </div>
        {/if}

        {#if itemTags.length > 0}
            <div class="flex flex-col gap-2">
                <h3 class="text-sm font-medium">{t("builds.editor.details.tags_items")}</h3>
                <div class="flex flex-wrap gap-2">
                    {#each itemTags as tag (tag.id)}
                        {@render tagButton(tag)}
                    {/each}
                </div>
            </div>
        {/if}
    </Card>
</div>
