<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { onMount, tick } from "svelte";
    import { Download } from "@lucide/svelte";
    import Shot from "$lib/components/shot.svelte";
    import { page } from "$app/state";
    import { currentRef, withRef } from "$lib/content/ref";
    import { FEATURES, GROUPS, featureText, featuresIn, groupText, type GroupId } from "$lib/content/features";
    import { useI18n } from "$lib/i18n";
    import features from "virtual:en/features";
    import { localizedHref } from "$lib/i18n/routes";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";

    const i18n = useI18n(features);
    const { t } = i18n;

    const ref = $derived(currentRef(page.url));

    const local = (href: string) => localizedHref(withRef(href, ref), i18n.locale);

    let group = $state<GroupId>("match");

    // A link such as /features#stats names a feature that may sit in a tab that is not open.
    onMount(async () => {
        const id = location.hash.slice(1);
        const target = FEATURES.find((feature) => feature.id === id);
        if (!target) return;
        group = target.group;
        await tick();
        document.getElementById(id)?.scrollIntoView({ block: "center" });
    });
</script>

<Seo title={t("features.title")} description={t("features.description")} />

<Page>
    <PageHeader title={t("features.heading")} subtitle={t("features.subtitle")}>
        {#snippet actions()}
            <a href={local("/download")} class={buttonVariants()}>
                <Download />
                {t("nav.download")}
            </a>
        {/snippet}
    </PageHeader>

    <Tabs.Root bind:value={group}>
        <!-- On a phone the names do not fit on one line, so they sit in two columns instead of running off the page. -->
        <Tabs.List class="grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-9 sm:w-auto">
            {#each GROUPS as item (item.id)}
                <Tabs.Trigger value={item.id} class="h-8 sm:h-auto">{groupText(i18n, item.id).name}</Tabs.Trigger>
            {/each}
        </Tabs.List>
        {#each GROUPS as item (item.id)}
            <Tabs.Content value={item.id}>
                <p class="mb-4 text-muted-foreground">{groupText(i18n, item.id).blurb}</p>
                <div class="grid gap-3 md:grid-cols-2">
                    {#each featuresIn(item.id) as feature (feature.id)}
                        {@const text = featureText(i18n, feature)}
                        <Card as="article" id={feature.id} padding="none" class="overflow-hidden">
                            {#if feature.shot}
                                <Shot
                                    name={feature.shot}
                                    detail={feature.detailShot}
                                    label={t("home.shot_label", { name: text.name })}
                                    framed={false}
                                />
                            {/if}
                            <div class="border-t border-border p-5">
                                <h2 class="text-xl text-brass">{text.name}</h2>
                                <p class="mt-1 text-sm text-muted-foreground">{text.summary}</p>
                                <ul class="mt-3 space-y-1.5 text-sm">
                                    {#each text.points as point (point)}
                                        <li class="flex gap-2.5">
                                            <span
                                                aria-hidden="true"
                                                class="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-brass"
                                            ></span>
                                            <span>{point}</span>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        </Card>
                    {/each}
                </div>
            </Tabs.Content>
        {/each}
    </Tabs.Root>
</Page>
