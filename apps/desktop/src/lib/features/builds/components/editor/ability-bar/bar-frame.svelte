<script lang="ts">
    import type { Snippet } from "svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "../../../build-detail.svelte";

    let {
        kit,
        title,
        class: className,
        actions,
        track,
        footer,
        icons,
        ...rest
    }: {
        kit: HeroKit | null;
        title: string;
        class?: string;
        actions?: Snippet;
        track: Snippet<[HeroKit]>;
        footer?: Snippet;
        /** One entry per ability, in slot order. */
        icons: Snippet<[HeroKit]>;
        [attribute: `data-${string}`]: string | undefined;
    } = $props();
</script>

<section aria-label={title} class={cn("flex min-h-[150px] overflow-hidden bg-card", className)} {...rest}>
    {#if !kit}
        <div class="flex flex-1 animate-pulse items-center gap-4 px-4" aria-busy="true">
            <div class="h-[50px] flex-1 rounded-md bg-muted/40"></div>
            {#each { length: 4 } as _, i (i)}
                <div class="size-16 rounded-full bg-muted/40"></div>
            {/each}
        </div>
    {:else if kit.failed}
        <RegionError
            name="ability-order"
            title={t("region.error_title")}
            body={t("region.error_body")}
            retryLabel={t("region.retry")}
            onretry={kit.failed.retry}
            size="sm"
            class="m-auto"
        />
    {:else if kit.abilities.size === 0}
        <p class="m-auto text-sm text-muted-foreground">{t("builds.editor.abilities.no_kit")}</p>
    {:else}
        <div class="flex min-w-0 flex-1 flex-col gap-2 px-4 pt-2.5 pb-2">
            <header class="flex min-h-7 items-center gap-x-3">
                <h3
                    class="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground whitespace-nowrap uppercase"
                >
                    {title}
                </h3>
                {@render actions?.()}
            </header>
            {@render track(kit)}
            {#if footer}
                <footer
                    class="mt-auto flex min-h-4 items-center gap-3 overflow-hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                >
                    {@render footer()}
                </footer>
            {/if}
        </div>
        <div
            class="flex shrink-0 items-center gap-1 border-l border-border bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--brass)_5%,transparent))] px-4"
            role="group"
            aria-label={t("builds.editor.abilities.icons_label")}
        >
            {@render icons(kit)}
        </div>
    {/if}
</section>
