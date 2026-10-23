<script lang="ts">
    import { Users } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";

    const ALL = "all";

    let {
        heroes,
        value,
        onchange,
        allLabel,
    }: {
        heroes: readonly Hero[];
        value: number | null;
        onchange: (heroId: number | null) => void;
        /** Offers an "every hero" choice under this label; without it a hero must be picked. */
        allLabel?: string;
    } = $props();

    const items = $derived([
        ...(allLabel === undefined ? [] : [{ value: ALL, label: allLabel, icon: null }]),
        ...heroes.map((h) => ({ value: String(h.id), label: h.name, icon: h.icon })),
    ]);
    const selected = $derived(value === null ? (allLabel === undefined ? undefined : ALL) : String(value));
</script>

<SelectMenu
    {items}
    value={selected}
    onValueChange={(v) => onchange(v === ALL ? null : Number(v))}
    placeholder={t("builds.browser.hero")}
    aria-label={t("builds.browser.hero")}
    class="w-52"
>
    {#snippet leading(item)}
        {#if item.icon}<img src={item.icon} alt="" />{:else}<Users aria-hidden="true" />{/if}
    {/snippet}
</SelectMenu>
