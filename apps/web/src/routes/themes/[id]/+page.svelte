<script lang="ts">
    import { onMount } from "svelte";
    import { ArrowLeft, Check, Download, ExternalLink, Sparkles } from "@lucide/svelte";
    import { page } from "$app/state";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import Seo from "$lib/components/seo.svelte";
    import ThemeFlavour from "$lib/components/theme-flavour.svelte";
    import ThemePreview from "$lib/components/theme-preview.svelte";
    import { currentRef, withRef } from "$lib/content/ref";
    import { themeById, themeEffects, themeOgImage } from "$lib/content/theme-pages";
    import { themeState } from "$lib/content/theme-state.svelte";
    import { THEMES, themeKey, themeVariantAttr } from "$lib/content/themes";
    import { useI18n } from "$lib/i18n";
    import { localizedHref } from "$lib/i18n/routes";
    import themesPage from "virtual:en/themes_page";

    let { data } = $props();

    const i18n = useI18n(themesPage);
    const { t } = i18n;

    const ref = $derived(currentRef(page.url));
    const local = (href: string) => localizedHref(withRef(href, ref), i18n.locale);

    const theme = $derived(themeById(data.id) ?? THEMES[0]!);
    const key = $derived(themeKey(theme.id));
    const name = $derived(t(`themes.${key}`));
    const description = $derived(t(`themes_page.descriptions.${key}`));
    const effects = $derived(themeEffects(theme));

    let mounted = $state(false);
    /** The flavour shown here; the site keeps its own until the visitor uses this one. */
    let chosen = $state<string | undefined>(undefined);
    const variant = $derived(themeVariantAttr(theme.id, chosen));
    const inUse = $derived(mounted && themeState.theme === theme.id && themeState.variant === variant);

    onMount(() => {
        themeState.load();
        if (themeState.theme === theme.id) chosen = themeState.variant;
        mounted = true;
    });

    function use() {
        themeState.pick(theme.id);
        if (variant) themeState.pickVariant(variant);
    }
</script>

<Seo
    title={t("themes_page.theme_title", { name })}
    description={t("themes_page.theme_description", { name, description })}
    image={themeOgImage(theme.id)}
    imageAlt={t("themes_page.og_alt", { name })}
/>

<Page>
    <a
        href={local("/themes")}
        class="-mx-2 inline-flex h-9 items-center gap-2 self-start rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass"
    >
        <ArrowLeft class="size-4 shrink-0" aria-hidden="true" />
        {t("themes.all")}
    </a>

    <PageHeader title={t("themes_page.theme_heading", { name })} subtitle={description}>
        {#snippet actions()}
            <Button onclick={use} disabled={inUse}>
                {#if inUse}
                    <Check />
                    {t("themes_page.in_use")}
                {:else}
                    <Sparkles />
                    {t("themes_page.use")}
                {/if}
            </Button>
        {/snippet}
    </PageHeader>

    <ThemePreview {theme} {variant} {name} class="aspect-[4/3] w-full sm:aspect-[16/9]" />

    <div class="grid gap-4 md:grid-cols-2">
        {#if theme.variants.length}
            <Card as="section" padding="lg" class="flex flex-col gap-3">
                <h2 id="theme-page-flavour" class="text-xl text-brass">{t("themes.flavour")}</h2>
                <ThemeFlavour
                    variants={theme.variants}
                    value={variant}
                    labelledby="theme-page-flavour"
                    onpick={(id) => (chosen = id)}
                />
            </Card>
        {/if}
        {#if effects.length}
            <Card as="section" padding="lg" class="flex flex-col gap-3">
                <h2 class="text-xl text-brass">{t("themes_page.effects_heading")}</h2>
                <ul class="flex flex-col gap-1.5 leading-relaxed">
                    {#each effects as effect (effect)}
                        <li class="flex items-center gap-2">
                            <span class="size-1.5 shrink-0 rounded-full bg-brass" aria-hidden="true"></span>
                            {t(effect)}
                        </li>
                    {/each}
                </ul>
            </Card>
        {/if}
        <Card as="section" padding="lg" class="flex flex-col items-start gap-3">
            <h2 class="text-xl text-brass">{t("themes_page.in_app_heading")}</h2>
            <p class="leading-relaxed">{t("themes_page.in_app_body", { name })}</p>
            <a href={local("/download")} class={buttonVariants({ variant: "outline" })}>
                <Download />
                {t("nav.download")}
            </a>
        </Card>
        {#if theme.source}
            <a
                href={theme.source}
                class="-mx-2 inline-flex h-9 items-center gap-2 self-start rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass md:col-span-2"
            >
                <ExternalLink class="size-4 shrink-0" aria-hidden="true" />
                {t("themes.based_on", { source: t(`themes.sources.${key}`) })}
            </a>
        {/if}
    </div>
</Page>
