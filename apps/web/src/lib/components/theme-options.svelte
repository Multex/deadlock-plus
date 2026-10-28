<script lang="ts">
    import type { Component, ComponentProps } from "svelte";
    import { ExternalLink } from "@lucide/svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { themeKey, type Theme } from "$lib/content/themes";
    import { themeState } from "$lib/content/theme-state.svelte";
    import { useI18n } from "$lib/i18n";
    import type ThemeFlavour from "./theme-flavour.svelte";

    let { theme }: { theme: Theme } = $props();

    const { t } = useI18n();

    let Flavour = $state<Component<ComponentProps<typeof ThemeFlavour>> | null>(null);

    // The menu brings a whole select widget, so only a visitor on a theme with flavours downloads it.
    $effect(() => {
        if (!theme.variants.length || Flavour) return;
        import("./theme-flavour.svelte").then((module) => (Flavour = module.default));
    });
</script>

{#if theme.effects || theme.variants.length || theme.source}
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        {#if theme.effects}
            <div class="flex items-center gap-2.5">
                <Switch
                    id="theme-effects"
                    checked={themeState.effects}
                    onCheckedChange={(on) => themeState.setEffects(on)}
                />
                <label for="theme-effects" class="text-foreground">{t("themes.effects")}</label>
            </div>
        {/if}
        {#if theme.variants.length}
            <div class="flex items-center gap-2.5">
                <span id="theme-flavour-label" class="text-foreground">{t("themes.flavour")}</span>
                {#if Flavour}
                    <Flavour
                        variants={theme.variants}
                        value={themeState.variant}
                        labelledby="theme-flavour-label"
                        onpick={(id) => themeState.pickVariant(id)}
                    />
                {:else}
                    <span class="h-9 w-40"></span>
                {/if}
            </div>
        {/if}
        {#if theme.source}
            <a
                href={theme.source}
                class="-mx-2 inline-flex h-9 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass"
            >
                <ExternalLink class="size-4 shrink-0" aria-hidden="true" />
                {t("themes.based_on", { source: t(`themes.sources.${themeKey(theme.id)}`) })}
            </a>
        {/if}
    </div>
{/if}
