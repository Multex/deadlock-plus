<script lang="ts">
    import type { Component } from "svelte";
    import {
        Building2,
        CloudFog,
        CloudRain,
        ExternalLink,
        Eye,
        Feather,
        Frame,
        Layers,
        Lightbulb,
        PawPrint,
        Snowflake,
        Sparkles,
    } from "@lucide/svelte";
    import AccentPicker from "@deadlock-plus/ui/accent-picker.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Accent } from "@deadlock-plus/ui/accent";
    import { THEMES as THEME_DATA } from "@deadlock-plus/ui/themes";
    import { openLink } from "$lib/core/open-link";
    import { t } from "$lib/core/i18n.svelte";
    import type { Theme } from "../themes";

    type Props = {
        theme: Theme;
        selected: boolean;
        /** The global Theme effects switch; while it is off the layer toggles have nothing to change. */
        effectsOn: boolean;
        layers: Record<string, boolean>;
        accent: Accent | null;
        onSelect: () => void;
        onLayer: (layer: string, on: boolean) => void;
        onAccent: (accent: Accent | null) => void;
        onKeydown: (e: KeyboardEvent) => void;
    };

    let { theme, selected, effectsOn, layers, accent, onSelect, onLayer, onAccent, onKeydown }: Props = $props();

    const LAYER_ICONS: Record<string, Component> = {
        rain: CloudRain,
        lights: Lightbulb,
        frames: Frame,
        clock: Eye,
        snow: Snowflake,
        stars: Sparkles,
        tail: Feather,
        tracks: PawPrint,
        fog: CloudFog,
        windows: Building2,
    };

    const data = $derived(THEME_DATA.find((d) => d.id === theme.id));
    const hasOptions = $derived(theme.effects.length > 0 || theme.customAccent || !!theme.source);
</script>

<div
    class="flex flex-col overflow-hidden rounded-md border transition-colors {selected ? 'border-brass bg-accent' : ''}"
>
    <Button
        variant="unstyled"
        type="button"
        role="radio"
        aria-checked={selected}
        tabindex={selected ? 0 : -1}
        onkeydown={onKeydown}
        onclick={onSelect}
        class="flex flex-1 flex-col gap-2 p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
        <span class="flex h-6 overflow-hidden rounded border">
            {#each theme.swatch as colour}
                <span class="flex-1" style="background: {colour}"></span>
            {/each}
        </span>
        <span class="text-sm font-semibold">{theme.label}</span>
        <span class="text-xs text-muted-foreground">{theme.description}</span>
    </Button>

    {#if hasOptions}
        <div class="flex flex-col gap-2.5 border-t px-3 py-2.5" data-theme-options>
            {#if theme.effects.length}
                <div class="grid grid-cols-2 gap-1.5" role="group" aria-label={t("settings.items.theme_effects")}>
                    {#each theme.effects as layer (layer.id)}
                        {@const on = layers[layer.id] !== false}
                        {@const Icon = LAYER_ICONS[layer.id] ?? Layers}
                        <Button
                            variant="toggle"
                            size="sm"
                            class="h-7 w-full justify-start px-2.5"
                            aria-pressed={on}
                            disabled={!effectsOn}
                            onclick={() => onLayer(layer.id, !on)}
                        >
                            <Icon aria-hidden="true" />
                            {layer.label}
                        </Button>
                    {/each}
                </div>
            {/if}
            {#if theme.customAccent && data}
                <AccentPicker
                    theme={data}
                    value={accent}
                    labels={{
                        title: t("settings.appearance.accent"),
                        hue: t("settings.appearance.accent_hue"),
                        vividness: t("settings.appearance.accent_vividness"),
                        hex: t("settings.appearance.accent_hex"),
                        reset: t("settings.appearance.accent_reset"),
                    }}
                    onValueChange={onAccent}
                />
            {/if}
            {#if theme.source}
                {@const source = theme.source}
                <button
                    type="button"
                    class="flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-brass hover:underline"
                    title={source.url}
                    onclick={() => void openLink(source.url)}
                >
                    <ExternalLink class="size-3.5" aria-hidden="true" />
                    {source.label}
                </button>
            {/if}
        </div>
    {/if}
</div>
