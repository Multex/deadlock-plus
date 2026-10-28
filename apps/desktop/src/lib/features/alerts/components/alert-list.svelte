<script lang="ts">
    import { ExternalLink, Newspaper } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { formatPublished, kindTone, sourceLabel, type Alert } from "../alerts";

    type Props = {
        items: Alert[];
        updateAlerts: boolean;
        onview: (item: Alert) => void;
    };

    let { items, updateAlerts, onview }: Props = $props();

    let brokenImages = $state<Set<string>>(new Set());
</script>

{#if items.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center text-base text-muted-foreground">
        <p>{t("alerts.empty")}</p>
        <p>{updateAlerts ? t("alerts.empty_hint_enabled") : t("alerts.empty_hint_disabled")}</p>
    </div>
{:else}
    <ul class="flex flex-col gap-4">
        {#each items as item (item.id)}
            {@const date = formatPublished(item.published)}
            {@const showImage = item.image !== null && !brokenImages.has(item.id)}
            <li>
                <Button
                    type="button"
                    variant="unstyled"
                    class="group flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4 hover:border-brass/50 hover:bg-accent/40"
                    onclick={() => onview(item)}
                >
                    <div class="flex items-stretch gap-5">
                        <div
                            class="hidden aspect-video w-72 shrink-0 overflow-hidden rounded-md bg-background sm:block"
                        >
                            {#if showImage}
                                <img
                                    src={item.image}
                                    alt=""
                                    loading="lazy"
                                    class="size-full object-contain"
                                    onerror={() => (brokenImages = new Set(brokenImages).add(item.id))}
                                />
                            {:else}
                                <div
                                    class="flex size-full items-center justify-center text-muted-foreground/40"
                                    aria-hidden="true"
                                >
                                    <Newspaper class="size-10" />
                                </div>
                            {/if}
                        </div>

                        <div class="flex min-w-0 flex-1 flex-col justify-center gap-3">
                            <div class="flex flex-wrap items-center gap-2">
                                <Badge
                                    variant={kindTone(item.kind) === "notable" ? "warning" : "secondary"}
                                    class="px-3 py-1 text-base"
                                >
                                    {item.kind}
                                </Badge>
                                <Badge variant="outline" class="px-3 py-1 text-base">{sourceLabel(item.source)}</Badge>
                                {#if date}<span class="text-base text-muted-foreground">{date}</span>{/if}
                                {#if !item.read}
                                    <span class="ml-auto flex items-center gap-1.5 text-sm font-medium text-brass">
                                        <span class="size-2 rounded-full bg-brass" aria-hidden="true"></span>{t(
                                            "alerts.new",
                                        )}
                                    </span>
                                {/if}
                            </div>

                            <h2 class="font-heading text-3xl font-semibold leading-tight tracking-wide text-foreground">
                                {item.title}
                            </h2>

                            <span class="flex items-center gap-1.5 text-base font-medium text-brass">
                                {t("alerts.read_full")}
                                <ExternalLink class="size-4" aria-hidden="true" />
                            </span>
                        </div>
                    </div>

                    {#if item.summary}
                        <p class="line-clamp-6 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                            {item.summary}
                        </p>
                    {/if}
                </Button>
            </li>
        {/each}
    </ul>
{/if}
