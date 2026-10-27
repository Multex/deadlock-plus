<script lang="ts">
    import { ArrowRight } from "@lucide/svelte";
    import type { Component } from "svelte";
    import { t } from "$lib/core/i18n.svelte";

    type Tool = {
        id: string;
        href: string;
        label: string;
        description: string;
        icon: Component<{ class?: string }>;
    };

    let { tools }: { tools: Tool[] } = $props();
</script>

<section class="flex flex-col gap-3" aria-label={t("home.tools")}>
    <h2 class="font-heading text-sm font-semibold tracking-wide text-muted-foreground">{t("home.tools")}</h2>
    <ul class="flex flex-wrap justify-center gap-3">
        {#each tools as tool (tool.id)}
            {@const Icon = tool.icon}
            <li class="w-full md:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]">
                <a
                    href={tool.href}
                    class="group flex h-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
                >
                    <Icon class="size-5 shrink-0 text-brass" />
                    <div class="min-w-0 flex-1">
                        <p class="font-heading text-sm font-semibold tracking-wide">{tool.label}</p>
                        <p class="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <ArrowRight
                        aria-hidden="true"
                        class="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                    />
                </a>
            </li>
        {/each}
    </ul>
</section>
