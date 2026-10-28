<script lang="ts">
    import { onMount, type Component, type ComponentProps } from "svelte";
    import { useI18n } from "$lib/i18n";
    import { isSuggestionDismissed, suggestedLocale } from "$lib/i18n/suggest";
    import type LanguageOffer from "./language-offer.svelte";

    const i18n = useI18n();

    let suggested = $state<string | null>(null);
    let Offer = $state<Component<ComponentProps<typeof LanguageOffer>> | null>(null);

    // Browser-only, so a crawler and the server render never see it, and it never sends the visitor anywhere unasked.
    // The banner itself loads only for a visitor it has something to offer.
    onMount(() => {
        const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
        const locale = suggestedLocale(
            i18n.locale,
            languages,
            isSuggestionDismissed(() => localStorage),
        );
        if (!locale) return;
        import("./language-offer.svelte").then((module) => {
            suggested = locale;
            Offer = module.default;
        });
    });
</script>

{#if Offer && suggested}
    <Offer locale={suggested} ondismiss={() => (suggested = null)} />
{/if}
