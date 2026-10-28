<script lang="ts">
    import { page } from "$app/state";

    import { useI18n } from "$lib/i18n";
    import { OG_IMAGE, SITE_NAME, socialMeta } from "./seo";
    import { siteNodes, jsonLd, type SchemaNode } from "./structured-data";

    let {
        title,
        description,
        noindex = false,
        schema = [],
    }: { title: string; description?: string; noindex?: boolean; schema?: SchemaNode[] } = $props();

    const { t, locale } = useI18n();

    const meta = $derived(socialMeta(page.url.pathname));
    const preview = $derived(description ?? t("site.tagline"));
    const structuredData = $derived(jsonLd([...siteNodes(locale), ...schema]));
</script>

<svelte:head>
    <title>{title}</title>
    {#if description}
        <meta name="description" content={description} />
    {/if}
    {#if noindex}
        <meta name="robots" content="noindex" />
    {/if}
    <link rel="canonical" href={meta.url} />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={preview} />
    <meta property="og:url" content={meta.url} />
    <meta property="og:image" content={meta.image} />
    <meta property="og:image:width" content={String(OG_IMAGE.width)} />
    <meta property="og:image:height" content={String(OG_IMAGE.height)} />
    <meta property="og:image:alt" content={t("site.og_image_alt")} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={preview} />
    <meta name="twitter:image" content={meta.image} />

    {@html `<script type="application/ld+json">${structuredData}</script>`}
</svelte:head>
