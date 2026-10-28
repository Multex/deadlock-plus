<script lang="ts">
    import { Check, ChevronDown, Languages } from "@lucide/svelte";
    import { page } from "$app/state";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { useI18n } from "$lib/i18n";
    import { LANGUAGES, languageName } from "$lib/i18n/languages";
    import { languageHref } from "$lib/i18n/routes";
    import { dismissSuggestion } from "$lib/i18n/suggest";

    let { open = $bindable(false) }: { open?: boolean } = $props();

    const i18n = useI18n();
    const { t } = i18n;
</script>

<DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger
        aria-label={t("language.current", { language: languageName(i18n.locale) })}
        class={buttonVariants({ variant: "outline" })}
    >
        <Languages />
        {languageName(i18n.locale)}
        <ChevronDown />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="max-h-72 min-w-56 overflow-y-auto">
        {#each LANGUAGES as language (language.code)}
            {@const current = language.code === i18n.locale}
            <DropdownMenu.Item class="justify-between gap-6">
                {#snippet child({ props })}
                    <!-- A chosen language is an answer to the browser-language banner too, so it stops asking. -->
                    <a
                        {...props}
                        href={languageHref(page.url.pathname, page.url.search, language.code)}
                        hreflang={language.code}
                        lang={language.code}
                        aria-current={current ? "true" : undefined}
                        onclick={() => dismissSuggestion(() => localStorage)}
                    >
                        <span class="font-medium">{language.name}</span>
                        {#if current}<Check class="size-4 text-brass" />{/if}
                    </a>
                {/snippet}
            </DropdownMenu.Item>
        {/each}
    </DropdownMenu.Content>
</DropdownMenu.Root>
