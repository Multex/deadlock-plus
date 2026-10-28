<script lang="ts">
    import { page } from "$app/state";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { SITE_URL } from "@deadlock-plus/links/urls";
    import { OG_IMAGE } from "$lib/components/seo";
    import ThemePreview from "$lib/components/theme-preview.svelte";
    import { shotUrl } from "$lib/content/shots";
    import { themeById, themePath } from "$lib/content/theme-pages";
    import { themeKey, themeStyle } from "$lib/content/themes";
    import { around, useI18n } from "$lib/i18n";
    import og from "virtual:en/og";
    import themesPage from "virtual:en/themes_page";

    const { t } = useI18n(og, themesPage);
    const [taglineBefore, taglineAfter] = around(t("og.tagline"), "game");

    // `?theme=<id>` draws that theme's own link preview, for its page under /themes.
    const theme = $derived(themeById(page.url.searchParams.get("theme") ?? ""));
</script>

<svelte:head>
    <title>{t("og.title")}</title>
</svelte:head>

{#if theme}
    {@const key = themeKey(theme.id)}
    {@const name = t(`themes.${key}`)}
    <div
        data-og
        class="fixed top-0 left-0 z-[calc(var(--z-grain)+1)] overflow-hidden"
        style:width="{OG_IMAGE.width}px"
        style:height="{OG_IMAGE.height}px"
    >
        <ThemePreview {theme} {name} always bare class="absolute inset-0 rounded-none border-0" />
        <div
            class="og-theme relative flex h-full flex-col items-start justify-center px-16"
            style={themeStyle(theme.id)}
        >
            <BrandMark class="[zoom:2.4]" />
            <p class="mt-[30px] font-heading text-[5.2rem] leading-none font-semibold text-foreground">{name}</p>
            <p class="mt-[26px] max-w-[660px] text-[2.1rem] leading-snug text-foreground/85">
                {t(`themes_page.descriptions.${key}`)}
            </p>
            <p class="mt-[34px] text-[1.7rem] text-brass">{new URL(SITE_URL).host}{themePath(theme.id)}</p>
        </div>
    </div>
{:else}
    <!-- Fixed over the site's header, footer and film grain (the grain doubles the PNG's size): `scripts/og.mjs` captures exactly this box as `static/og.png`. -->
    <div
        data-og
        class="noir-panel fixed top-0 left-0 z-[calc(var(--z-grain)+1)] flex items-center gap-12 overflow-hidden px-16"
        style:width="{OG_IMAGE.width}px"
        style:height="{OG_IMAGE.height}px"
    >
        <div class="flex min-w-0 flex-1 flex-col items-start">
            <BrandMark class="[zoom:3]" />
            <p class="mt-[34px] font-heading text-[3.4rem] leading-[1.15] font-semibold text-foreground">
                {taglineBefore}<span class="text-brass">Deadlock</span>{taglineAfter}
            </p>
            <p class="mt-[34px] text-[1.9rem] text-muted-foreground">{new URL(SITE_URL).host}</p>
        </div>

        <!-- The crop is drawn a little larger and shifted, so its own card border and outer gutter fall outside the frame and the frame ends on a row line. -->
        <div
            class="h-[510px] w-[520px] shrink-0 overflow-hidden rounded-xl border border-brass/40 bg-chrome shadow-2xl shadow-black/60"
        >
            <img src={shotUrl("match-mobile")} alt="" class="-mt-[7px] -ml-[7px] w-[532px] max-w-none" />
        </div>
    </div>
{/if}

<style>
    /* The words sit on the left, so the theme's effects stay clear on the right. */
    .og-theme {
        background: linear-gradient(
            90deg,
            color-mix(in oklch, var(--background) 88%, transparent) 0 45%,
            transparent 80%
        );
    }
</style>
