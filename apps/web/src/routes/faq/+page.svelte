<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { faqPage } from "$lib/components/structured-data";
    import { page } from "$app/state";
    import { FAQ } from "$lib/content/faq";
    import { currentRef, withRef } from "$lib/content/ref";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    const ref = $derived(currentRef(page.url));
</script>

<Seo
    title="Deadlock+ FAQ: Discord, Servers, Linux, Privacy"
    description="Answers about Deadlock+: showing your match and rank on Discord, picking servers, Linux and Mac, where stats come from, privacy and open source."
    schema={[faqPage(FAQ)]}
/>

<Page>
    <PageHeader title="Deadlock+ FAQ" subtitle="Short answers to what people ask most." />

    <div class="grid gap-3">
        {#each FAQ as item (item.question)}
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
