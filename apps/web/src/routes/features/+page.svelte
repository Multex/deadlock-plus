<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { onMount, tick } from "svelte";
    import { Download } from "@lucide/svelte";
    import Shot from "$lib/components/shot.svelte";
    import { page } from "$app/state";
    import { currentRef, withRef } from "$lib/content/ref";
    import { FEATURES, GROUPS, featuresIn, type GroupId } from "$lib/content/features";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";

    const ref = $derived(currentRef(page.url));

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

<Seo
    title="Rich Presence, Server Picker, Match History | Deadlock+"
    description="Everything Deadlock+ does for Deadlock: Discord Rich Presence, a server picker, live match info, a build editor, match history, stats, replays and performance."
/>

<Page>
    <PageHeader
        title="Deadlock+ features"
        subtitle="Each page of Deadlock+ does one job. Here is what each one is for."
    >
        {#snippet actions()}
            <a href={withRef("/download", ref)} class={buttonVariants()}>
                <Download />
                Download
            </a>
        {/snippet}
    </PageHeader>

    <Tabs.Root bind:value={group}>
        <Tabs.List>
            {#each GROUPS as item (item.id)}
                <Tabs.Trigger value={item.id}>{item.name}</Tabs.Trigger>
            {/each}
        </Tabs.List>
        {#each GROUPS as item (item.id)}
            <Tabs.Content value={item.id}>
                <p class="mb-4 text-muted-foreground">{item.blurb}</p>
                <div class="grid gap-3 md:grid-cols-2">
                    {#each featuresIn(item.id) as feature (feature.id)}
                        <Card as="article" id={feature.id} padding="none" class="overflow-hidden">
                            {#if feature.shot}
                                <Shot
                                    name={feature.shot}
                                    detail={feature.detailShot}
                                    label="{feature.name} in Deadlock+"
                                    framed={false}
                                />
                            {/if}
                            <div class="border-t border-border p-5">
                                <h2 class="text-xl text-brass">{feature.name}</h2>
                                <p class="mt-1 text-sm text-muted-foreground">{feature.summary}</p>
                                <ul class="mt-3 space-y-1.5 text-sm">
                                    {#each feature.points as point (point)}
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
