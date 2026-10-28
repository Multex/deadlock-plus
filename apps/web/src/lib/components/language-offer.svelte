<script lang="ts">
    import { onMount } from "svelte";
    import { X } from "@lucide/svelte";
    import { page } from "$app/state";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { en, type Translator } from "$lib/i18n";
    import { catalogsFor } from "$lib/i18n/catalogs";
    import { createTranslator } from "$lib/i18n/core";
    import { languageName } from "$lib/i18n/languages";
    import { languageHref } from "$lib/i18n/routes";
    import { dismissSuggestion } from "$lib/i18n/suggest";

    let { locale, ondismiss }: { locale: string; ondismiss: () => void } = $props();

    const name = $derived(languageName(locale));
    let text = $state<Translator | null>(null);

    // Worded in the suggested language, which the visitor reads, rather than the page's.
    onMount(async () => {
        text = createTranslator(locale, { ...(await catalogsFor(locale)), en });
    });

    function dismiss() {
        dismissSuggestion(() => localStorage);
        ondismiss();
    }
</script>

{#if text}
    <div lang={locale} class="border-b border-border bg-chrome">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-8">
            <p class="mr-auto text-sm text-foreground">{text.t("language.suggestion", { language: name })}</p>
            <div class="flex items-center gap-1">
                <a
                    href={languageHref(page.url.pathname, page.url.search, locale)}
                    hreflang={locale}
                    class={buttonVariants({ size: "sm" })}
                    onclick={() => dismissSuggestion(() => localStorage)}
                >
                    {text.t("language.switch", { language: name })}
                </a>
                <IconButton label={text.t("language.dismiss")} onclick={dismiss}>
                    <X />
                </IconButton>
            </div>
        </div>
    </div>
{/if}
