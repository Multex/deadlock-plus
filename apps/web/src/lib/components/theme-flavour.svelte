<script lang="ts">
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import type { ThemeVariant } from "$lib/content/themes";

    let {
        variants,
        value,
        labelledby,
        onpick,
    }: { variants: ThemeVariant[]; value: string | undefined; labelledby: string; onpick: (id: string) => void } =
        $props();

    const items = $derived(variants.map((v) => ({ value: v.id, label: v.name })));
</script>

<SelectMenu class="w-40" {items} {value} aria-labelledby={labelledby} onValueChange={onpick}>
    {#snippet leading(item)}
        {@const colours = variants.find((v) => v.id === item.value)?.swatch}
        <span
            class="grid size-full place-items-center rounded ring-1 ring-border ring-inset"
            style:background={colours?.[0]}
            aria-hidden="true"
        >
            <span class="size-2 rounded-full" style:background={colours?.[2]}></span>
        </span>
    {/snippet}
</SelectMenu>
