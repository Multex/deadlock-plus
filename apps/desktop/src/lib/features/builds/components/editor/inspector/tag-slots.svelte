<script lang="ts">
    import { Check, X } from "@lucide/svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
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

    function place(slot: number, id: number) {
        const next = setTagSlot(editor.build.tags, slot, id);
        if (next !== editor.build.tags) editor.apply(updateBuild(editor.build, { tags: next }));
    }
</script>

<!--
    The game's standard tag icons each come in their own accent colour; drawing them as a mask in
    currentColor gives every slot and menu row one tint that follows the theme.
-->
{#snippet glyph(tag: TagInfo, size: string)}
    {#if tag.kind === "standard" && tag.icon}
        <span
            class={cn("shrink-0 bg-current mask-contain mask-center mask-no-repeat", size)}
            style:mask-image={`url("${tag.icon}")`}
            aria-hidden="true"
        ></span>
    {:else if tag.kind === "ability" || tag.kind === "item"}
        {#if tag.art}
            <span class={cn("relative shrink-0 overflow-hidden rounded-[3px] bg-black/30", size)} aria-hidden="true">
                <img src={tag.art} alt="" class="size-full object-cover" />
                <span class="absolute inset-0 rounded-[inherit] ring-1 ring-white/12 ring-inset"></span>
            </span>
        {:else}
            {@render initial(tag, size)}
        {/if}
    {:else}
        {@render initial(tag, size)}
    {/if}
{/snippet}

{#snippet initial(tag: TagInfo, size: string)}
    <!-- The letter is generated content so it stays out of the tag's accessible name and text. -->
    <span
        class={cn(
            "grid shrink-0 place-items-center rounded-[3px] border border-current/30 text-[11px] leading-none font-semibold uppercase before:content-[attr(data-initial)]",
            size,
        )}
        data-initial={label(tag).trim().charAt(0) || "?"}
        aria-hidden="true"
    ></span>
{/snippet}

{#snippet option(slot: number, tag: TagInfo, current: TagInfo | null)}
    <DropdownMenu.Item onSelect={() => place(slot, tag.id)} disabled={current?.id === tag.id}>
        <span class="contents text-foreground">{@render glyph(tag, "size-5")}</span>
        <span class="truncate">{label(tag)}</span>
        {#if taken.has(tag.id)}
            <Check class={cn("ml-auto", current?.id !== tag.id && "opacity-50")} aria-hidden="true" />
        {/if}
    </DropdownMenu.Item>
{/snippet}

<ul class="flex gap-2" aria-labelledby={labelledby} data-testid="tag-slots">
    {#each slots as current, slot (slot)}
        {@const art = current !== null && (current.kind === "ability" || current.kind === "item") && !!current.art}
        <li>
            <DropdownMenu.Root>
                <Tooltip.Provider>
                    <Tooltip.Root delayDuration={150} disabled={current === null}>
                        <Tooltip.Trigger>
                            {#snippet child({ props })}
                                <DropdownMenu.Trigger
                                    {...props}
                                    class={cn(
                                        "grid size-11 place-items-center overflow-hidden rounded-md border transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-expanded:border-ring/70 aria-expanded:text-foreground",
                                        current
                                            ? "border-border bg-muted/60 text-foreground hover:border-ring/60 hover:bg-muted"
                                            : "border-dashed border-border bg-black/20 text-muted-foreground hover:border-ring/60 hover:bg-muted/40 hover:text-foreground",
                                        art && "p-[3px]",
                                    )}
                                    aria-label={current
                                        ? t("builds.editor.inspector.tag_slot_filled", {
                                              slot: slot + 1,
                                              name: label(current),
                                          })
                                        : t("builds.editor.inspector.tag_slot_empty", { slot: slot + 1 })}
                                    data-slot={slot}
                                >
                                    {#if current}
                                        {@render glyph(current, art ? "size-full" : "size-6")}
                                    {:else}
                                        <span class="text-lg leading-none font-semibold" aria-hidden="true">?</span>
                                    {/if}
                                </DropdownMenu.Trigger>
                            {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="top">{current ? label(current) : ""}</Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
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
