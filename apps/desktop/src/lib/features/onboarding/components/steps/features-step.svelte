<script lang="ts">
    import type { Component } from "svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { featureGroups } from "../../onboarding";

    type Feature = { id: string; label: string; icon: Component<{ class?: string }> };

    let { features }: { features: Feature[] } = $props();

    const byId = $derived(new Map(features.map((f) => [f.id, f])));
</script>

<h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.features.title")}</h1>

<div class="flex flex-col gap-4">
    {#each featureGroups() as group (group.id)}
        <section class="flex flex-col gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{group.title}</h2>
            <div class="grid gap-2 sm:grid-cols-2">
                {#each group.items as item (item.id)}
                    {@const feature = byId.get(item.id)}
                    {#if feature}
                        {@const Icon = feature.icon}
                        <Card padding="sm" class="flex items-center gap-3">
                            <span
                                class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
                            >
                                <Icon class="size-4" />
                            </span>
                            <div class="flex min-w-0 flex-col">
                                <span class="font-heading text-sm font-semibold tracking-wide">{feature.label}</span>
                                <span class="text-xs text-muted-foreground">{item.blurb}</span>
                            </div>
                        </Card>
                    {/if}
                {/each}
            </div>
        </section>
    {/each}
</div>
