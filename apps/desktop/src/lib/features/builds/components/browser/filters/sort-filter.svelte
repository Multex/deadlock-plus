<script lang="ts" generics="S extends string">
    import { ArrowDownWideNarrow } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { t } from "$lib/core/i18n.svelte";

    let {
        options,
        value,
        onchange,
    }: { options: readonly { value: S; label: string }[]; value: S; onchange: (sort: S) => void } = $props();
</script>

<SelectMenu
    items={options}
    {value}
    onValueChange={(v) => onchange(v as S)}
    aria-label={t("builds.browser.sort")}
    class="w-52"
>
    {#snippet icon()}<ArrowDownWideNarrow />{/snippet}
</SelectMenu>
