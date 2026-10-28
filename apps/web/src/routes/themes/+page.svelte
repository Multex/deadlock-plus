<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import { page } from "$app/state";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import Seo from "$lib/components/seo.svelte";
    import ThemePreview from "$lib/components/theme-preview.svelte";
    import { currentRef, withRef } from "$lib/content/ref";
    import { themePath } from "$lib/content/theme-pages";
    import { THEMES, themeKey } from "$lib/content/themes";
    import { useI18n } from "$lib/i18n";
    import { localizedHref } from "$lib/i18n/routes";
    import themesPage from "virtual:en/themes_page";

    const i18n = useI18n(themesPage);
    const { t } = i18n;

    const ref = $derived(currentRef(page.url));
    const local = (href: string) => localizedHref(withRef(href, ref), i18n.locale);
</script>

<Seo title={t("themes_page.title")} description={t("themes_page.description")} />

<Page>
    <PageHeader title={t("themes_page.heading")} subtitle={t("themes_page.subtitle")} />

    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each THEMES as theme (theme.id)}
            {@const key = themeKey(theme.id)}
            {@const name = t(`themes.${key}`)}
            <li>
                <Card as="article" padding="none" class="relative flex h-full flex-col overflow-hidden">
                    <ThemePreview {theme} {name} class="aspect-[16/10] rounded-none border-0 border-b" />
                    <div class="flex flex-1 flex-col gap-2 p-4">
                        <div class="flex items-center justify-between gap-2">
                            <h2 class="text-xl">
                                <a
                                    href={local(themePath(theme.id))}
                                    class="rounded-sm text-foreground transition-colors after:absolute after:inset-0 hover:text-brass focus-visible:text-brass"
                                >
                                    {name}
                                </a>
                            </h2>
                            {#if theme.effects}
                                <Badge variant="outline">{t("themes_page.animated")}</Badge>
                            {/if}
                        </div>
                        <p class="leading-relaxed text-muted-foreground">
                            {t(`themes_page.descriptions.${key}`)}
                        </p>
                        {#if theme.source}
                            <a
                                href={theme.source}
                                class="relative z-(--z-local) -mx-2 mt-auto inline-flex min-h-9 items-center gap-2 self-start rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass"
                            >
                                <ExternalLink class="size-4 shrink-0" aria-hidden="true" />
                                {t("themes.based_on", { source: t(`themes.sources.${key}`) })}
                            </a>
                        {/if}
                    </div>
                </Card>
            </li>
        {/each}
    </ul>
</Page>
