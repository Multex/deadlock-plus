<script lang="ts">
    import { Check, X } from "@lucide/svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t } from "$lib/core/i18n.svelte";
    import { updateBuild } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import {
        TAG_SLOTS,
        buildItemIds,
        describeTag,
        type NamedThing,
        type StandardTag,
        type TagInfo,
    } from "$lib/features/builds/editor/details";
    import { setTagSlot } from "./actions";

    let {
        editor,
        standard,
        items,
        abilities,
        labelledby,
    }: {
        editor: BuildEditor;
        standard: readonly StandardTag[];
        items?: ReadonlyMap<number, NamedThing>;
        abilities?: ReadonlyMap<number, NamedThing>;
        labelledby: string;
    } = $props();

    const build = $derived(editor.build);
    const names = $derived({ standard, items, abilities });
    const slots = $derived(
        Array.from({ length: TAG_SLOTS }, (_, i) => {
            const id = build.tags[i] ?? 0;
            return id === 0 ? null : describeTag(id, names);
        }),
    );
    const taken = $derived(new Set(build.tags.filter((tag) => tag !== 0)));
    const abilityTags = $derived([...(abilities?.keys() ?? [])].map((a) => describeTag(a, names)));
    const itemTags = $derived(
        items ? buildItemIds(build).flatMap((i) => (items.has(i) ? [describeTag(i, names)] : [])) : [],
    );

    function label(tag: TagInfo): string {
        switch (tag.kind) {
            case "standard":
                return tag.name ?? t(`builds.editor.details.tag_${tag.key}`);
            case "ability":
            case "item":
                return tag.name;
            case "unknown":
                return t("builds.editor.details.tag_unknown", { id: tag.id });
        }
    }

    const art = (tag: TagInfo) => (tag.kind === "ability" || tag.kind === "item" ? tag.art : undefined);

    function place(slot: number, id: number) {
        const next = setTagSlot(editor.build.tags, slot, id);
        if (next !== editor.build.tags) editor.apply(updateBuild(editor.build, { tags: next }));
    }
</script>

{#snippet option(slot: number, tag: TagInfo, current: TagInfo | null)}
    {@const src = art(tag)}
    <DropdownMenu.Item onSelect={() => place(slot, tag.id)} disabled={current?.id === tag.id}>
        {#if src}
            <img {src} alt="" class="size-5 shrink-0 rounded-sm object-cover" />
        {/if}
        <span class="truncate">{label(tag)}</span>
        {#if taken.has(tag.id)}
            <Check class={cn("ml-auto", current?.id !== tag.id && "opacity-50")} aria-hidden="true" />
        {/if}
    </DropdownMenu.Item>
{/snippet}

<ul class="grid grid-cols-3 gap-2" aria-labelledby={labelledby} data-testid="tag-slots">
    {#each slots as current, slot (slot)}
        {@const src = current ? art(current) : undefined}
        <li>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger
                    class={cn(
                        "group flex h-14 w-full flex-col items-center justify-center gap-1 rounded-md border px-1.5 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        current
                            ? "border-border bg-muted/40 hover:border-ring/60"
                            : "border-dashed border-border/80 text-muted-foreground hover:border-ring/60 hover:text-foreground",
                    )}
                    aria-label={current
                        ? t("builds.editor.inspector.tag_slot_filled", { slot: slot + 1, name: label(current) })
                        : t("builds.editor.inspector.tag_slot_empty", { slot: slot + 1 })}
                    data-slot={slot}
                >
                    {#if current}
                        {#if src}
                            <img {src} alt="" class="size-6 rounded-sm object-cover" />
                        {/if}
                        <span class="line-clamp-2 text-[11px] leading-tight font-medium">{label(current)}</span>
                    {:else}
                        <span class="text-xl leading-none font-semibold" aria-hidden="true">?</span>
                    {/if}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start" class="max-h-96 w-64 overflow-y-auto">
                    {#if current}
                        <DropdownMenu.Item onSelect={() => place(slot, 0)}>
                            <X />
                            {t("builds.editor.inspector.tag_clear")}
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                    {/if}
                    <DropdownMenu.Group>
                        <DropdownMenu.GroupHeading>{t("builds.editor.details.tags_standard")}</DropdownMenu.GroupHeading
                        >
                        {#each standard as tag (tag.key)}
                            {@render option(slot, { kind: "standard", ...tag }, current)}
                        {/each}
                    </DropdownMenu.Group>
                    {#if abilityTags.length > 0}
                        <DropdownMenu.Separator />
                        <DropdownMenu.Group>
                            <DropdownMenu.GroupHeading>
                                {t("builds.editor.details.tags_abilities")}
                            </DropdownMenu.GroupHeading>
                            {#each abilityTags as tag (tag.id)}
                                {@render option(slot, tag, current)}
                            {/each}
                        </DropdownMenu.Group>
                    {/if}
                    {#if itemTags.length > 0}
                        <DropdownMenu.Separator />
                        <DropdownMenu.Sub>
                            <DropdownMenu.SubTrigger>{t("builds.editor.details.tags_items")}</DropdownMenu.SubTrigger>
                            <DropdownMenu.SubContent class="max-h-80 w-60 overflow-y-auto">
                                {#each itemTags as tag (tag.id)}
                                    {@render option(slot, tag, current)}
                                {/each}
                            </DropdownMenu.SubContent>
                        </DropdownMenu.Sub>
                    {/if}
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </li>
    {/each}
</ul>
