<script lang="ts">
    import { Languages } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { languageOptions } from "../../../editor/details";

    let {
        value,
        onchange,
        withDefault = false,
    }: {
        /** "default" is the app's language plus English; a number is one Steam ELanguage. */
        value: "default" | "any" | number;
        onchange: (language: "default" | "any" | number) => void;
        /** Offers the app's language plus English, as the Public tab asks the API for by default. */
        withDefault?: boolean;
    } = $props();

    const items = $derived([
        ...(withDefault ? [{ value: "default", label: t("builds.browser.language_default") }] : []),
        { value: "any", label: t("builds.browser.language_any") },
        ...languageOptions(i18n.locale, 0, String),
    ]);
</script>

<SelectMenu
    {items}
    value={String(value)}
    onValueChange={(v) => onchange(v === "default" || v === "any" ? v : Number(v))}
    aria-label={t("builds.browser.language")}
    size="sm"
    class="w-56"
>
    {#snippet icon()}<Languages />{/snippet}
</SelectMenu>
