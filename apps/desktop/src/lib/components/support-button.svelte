<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Button, { type ButtonSize, type ButtonVariant } from "@deadlock-plus/ui/button.svelte";
    import { openSupport } from "$lib/features/support/support";
    import KofiIcon from "@deadlock-plus/ui/icons/kofi.svelte";

    let {
        variant = "ghost",
        size = "sm",
        class: className,
    }: { variant?: ButtonVariant; size?: ButtonSize; class?: string } = $props();
</script>

<Button {variant} {size} class={className} onclick={openSupport}>
    <KofiIcon class="text-kofi" />
    {t("support.action")}
</Button>
