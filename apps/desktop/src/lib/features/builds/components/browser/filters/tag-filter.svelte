<script lang="ts">
    import { Tag } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";

    const ANY = "any";

    let {
        tags,
        value,
        onchange,
    }: { tags: readonly BuildTag[]; value: number | null; onchange: (tag: number | null) => void } = $props();

    const items = $derived([
        { value: ANY, label: t("builds.browser.tag_any"), icon: null },
        ...tags.map((tag) => ({ value: String(tag.id), label: tag.name, icon: tag.icon ?? null })),
    ]);
</script>

<SelectMenu
    {items}
    value={value === null ? ANY : String(value)}
    onValueChange={(v) => onchange(v === ANY ? null : Number(v))}
    aria-label={t("builds.browser.tag")}
    size="sm"
    class="w-48"
>
    {#snippet leading(item)}
        {#if item.icon}<img src={item.icon} alt="" class="object-contain!" />{:else}<Tag />{/if}
    {/snippet}
</SelectMenu>
