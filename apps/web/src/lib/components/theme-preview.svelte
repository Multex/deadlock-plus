<script lang="ts" module>
    import { pickLive } from "./theme-preview";

    // Shared by every preview on the page, so only the one most in view runs its effects.
    const ratios = new Map<string, number>();
    let running = $state<string | null>(null);
    let observer: IntersectionObserver | undefined;
    const keys = new WeakMap<Element, string>();
    let count = 0;

    function watch(node: Element, key: string): () => void {
        observer ??= new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const id = keys.get(entry.target);
                    if (id) ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
                }
                running = pickLive(ratios, running);
            },
            { threshold: [0, 0.35, 0.5, 0.75, 1] },
        );
        keys.set(node, key);
        observer.observe(node);
        return () => {
            observer?.unobserve(node);
            ratios.delete(key);
            running = pickLive(ratios, running === key ? null : running);
        };
    }
</script>

<script lang="ts">
    import type { Component } from "svelte";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { themeStyle, type Theme } from "$lib/content/themes";
    import { cn } from "@deadlock-plus/ui/utils";

    type Decor = Component<{ theme: string; layers?: Record<string, boolean> }>;

    let {
        theme,
        variant,
        name,
        always = false,
        bare = false,
        class: className,
    }: {
        theme: Theme;
        variant?: string;
        /** Drawn in the preview's mock page; the page around it names the theme for screen readers. */
        name: string;
        /** Runs the effects whether or not the preview is the one most in view, for the link preview capture. */
        always?: boolean;
        /** Only the theme's background and effects, without the mock page. */
        bare?: boolean;
        class?: string;
    } = $props();

    const key = `preview-${count++}`;
    let Decor = $state<Decor | null>(null);

    const live = $derived(theme.effects && (always || running === key));

    $effect(() => {
        if (!live || Decor) return;
        import("@deadlock-plus/ui/theme-decor.svelte").then((module) => (Decor = module.default));
    });

    function observe(node: HTMLElement) {
        return watch(node, key);
    }
</script>

<!-- Its own decor scope, so effects that hang around the page's content measure this box and not the page. -->
<div
    {@attach observe}
    data-decor-scope
    aria-hidden="true"
    class={cn(
        "relative isolate overflow-hidden rounded-lg border border-border bg-background text-foreground",
        className,
    )}
    style={themeStyle(theme.id, variant)}
>
    <div class="poster absolute inset-0"></div>
    {#if live && Decor}
        <Decor theme={theme.id} />
    {/if}
    {#if !bare}
        <div class="relative flex h-full flex-col">
            <div class="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-chrome/95 px-3">
                <BrandMark wordmark={false} class="[zoom:0.8]" />
                <span class="h-1.5 w-12 rounded-full bg-muted-foreground/40"></span>
                <span class="h-1.5 w-8 rounded-full bg-muted-foreground/25"></span>
            </div>
            <div class="flex flex-1 flex-col justify-end gap-3 p-4">
                <p class="font-heading text-xl leading-tight font-semibold text-foreground">{name}</p>
                <div class="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
                    <span class="h-1.5 w-10 rounded-full bg-brass"></span>
                    <span class="h-1.5 w-3/4 rounded-full bg-card-foreground/50"></span>
                    <span class="h-1.5 w-1/2 rounded-full bg-muted-foreground/40"></span>
                </div>
                <div class="flex gap-2">
                    <span class="h-6 w-20 rounded-md bg-primary"></span>
                    <span class="h-6 w-14 rounded-md border border-border bg-secondary"></span>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    /* The still picture shown while the effects are not running: the theme's own light from the top. */
    .poster {
        background: radial-gradient(
            120% 70% at 50% 0%,
            color-mix(in oklch, var(--brass) 14%, transparent),
            transparent 70%
        );
    }
</style>
