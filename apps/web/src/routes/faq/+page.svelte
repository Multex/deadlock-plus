<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { faqPage } from "$lib/components/structured-data";
    import { page } from "$app/state";
    import { faq } from "$lib/content/faq";
    import { useI18n } from "$lib/i18n";
    import { currentRef, withRef } from "$lib/content/ref";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    const i18n = useI18n();
    const { t } = i18n;
    const items = faq(i18n);

    const ref = $derived(currentRef(page.url));
</script>

<Seo title={t("faq.title")} description={t("faq.description")} schema={[faqPage(items)]} />

<Page>
    <PageHeader title={t("faq.heading")} subtitle={t("faq.subtitle")} />

    <div class="grid gap-3">
        {#each items as item (item.question)}
            <Card as="section" padding="lg">
                <h2 class="text-xl text-brass">{item.question}</h2>
                <p class="mt-2 leading-relaxed">{item.answer}</p>
                {#if item.links}
                    <div class="mt-4 flex flex-wrap gap-2">
                        {#each item.links as link (link.href)}
                            <a href={withRef(link.href, ref)} class={buttonVariants({ variant: "outline", size: "sm" })}
                                >{link.label}</a
                            >
                        {/each}
                    </div>
                {/if}
            </Card>
        {/each}
    </div>
</Page>
