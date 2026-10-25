<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Component } from "svelte";
    import { Monitor, RotateCw, Sparkles, Turtle } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { THEMES, resolveMotionPreference } from "$lib/features/settings/themes";
    import { accentOf, layersOf } from "$lib/features/settings/theme-options";
    import ThemeCard from "../theme-card.svelte";
    import { UI_SCALE_RANGE } from "$lib/features/settings/app-window";
    import { restartApp } from "$lib/features/settings/api";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { platform } from "$lib/core/platform";
    import { formatNumber, t } from "$lib/core/i18n.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const MOTION_ICONS: Record<string, Component> = { system: Monitor, reduce: Turtle, full: Sparkles };
    const motionItems = $derived([
        { value: "system", label: t("settings.appearance.motion_system") },
        { value: "reduce", label: t("settings.appearance.motion_reduce") },
        { value: "full", label: t("settings.appearance.motion_full") },
    ]);

    // Zooming while the thumb is held would move the slider out from under the pointer, so the scale
    // applies on release and only the readout follows the drag.
    let scaleDraft = $state<number | null>(null);
    const scaleShown = $derived(scaleDraft ?? settings.uiScale);
    const percent = (value: number) => formatNumber(value / 100, { style: "percent" });

    function onThemeKeydown(e: KeyboardEvent) {
        const next = radioTarget(
            e.key,
            THEMES.findIndex((t) => t.id === settings.theme),
            THEMES.length,
        );
        if (next === null) return;
        e.preventDefault();
        settings.setTheme(THEMES[next].id);
        const radios =
            e.currentTarget instanceof HTMLElement
                ? (e.currentTarget.closest("[role=radiogroup]")?.querySelectorAll("[role=radio]") ?? [])
                : [];
        (radios[next] as HTMLElement | undefined)?.focus();
    }
</script>

{#if show("theme")}
    <Card as="section">
        <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
                <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.theme")}</h3>
                <p class="text-sm text-muted-foreground">{t("settings.appearance.theme_description")}</p>
            </div>
            <div role="radiogroup" aria-label={t("settings.items.theme")} class="grid grid-cols-2 gap-2">
                {#each THEMES as theme (theme.id)}
                    <ThemeCard
                        {theme}
                        selected={settings.theme === theme.id}
                        effectsOn={settings.themeEffects}
                        layers={layersOf(settings.themeOptions, theme.id)}
                        accent={accentOf(settings.themeOptions, theme.id)}
                        onSelect={() => settings.setTheme(theme.id)}
                        onLayer={(layer, on) => settings.setThemeLayer(theme.id, layer, on)}
                        onAccent={(accent) => settings.setThemeAccent(theme.id, accent)}
                        onKeydown={onThemeKeydown}
                    />
                {/each}
            </div>
        </div>
    </Card>
{/if}

{#if show("theme-effects")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.theme_effects")}
            for="theme-effects"
            description={t("settings.appearance.effects_description")}
        >
            <Switch
                id="theme-effects"
                checked={settings.themeEffects}
                onCheckedChange={(v) => settings.setThemeEffects(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("reduced-motion")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.reduced_motion")}
            for="reduced-motion"
            description={t("settings.appearance.motion_description")}
        >
            <SelectMenu
                id="reduced-motion"
                items={motionItems}
                value={settings.motion}
                onValueChange={(v) => settings.setMotion(resolveMotionPreference(v))}
                class="w-48 shrink-0"
            >
                {#snippet leading(item)}
                    {@const Icon = MOTION_ICONS[item.value] ?? Monitor}
                    <Icon aria-hidden="true" />
                {/snippet}
            </SelectMenu>
        </SettingRow>
    </Card>
{/if}

{#if show("accessible-font")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.accessible_font")}
            for="accessible-font"
            description={t("settings.appearance.font_description")}
        >
            <Switch
                id="accessible-font"
                checked={settings.accessibleFont}
                onCheckedChange={(v) => settings.setAccessibleFont(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("ui-scale")}
    <Card as="section">
        <SettingRow label={t("settings.items.ui_scale")} description={t("settings.appearance.scale_description")}>
            <div class="flex w-48 shrink-0 items-center gap-3">
                <Slider
                    class="min-w-0 flex-1"
                    value={settings.uiScale}
                    {...UI_SCALE_RANGE}
                    ticks
                    formatValue={percent}
                    bubble={false}
                    aria-label={t("settings.items.ui_scale")}
                    onValueChange={(v) => (scaleDraft = v)}
                    onValueCommit={(v) => {
                        scaleDraft = null;
                        void settings.setUiScale(v);
                    }}
                />
                <span class="w-10 text-right text-sm tabular-nums text-muted-foreground" aria-hidden="true">
                    {percent(scaleShown)}
                </span>
            </div>
        </SettingRow>
    </Card>
{/if}

{#if (platform === "windows" || platform === "linux") && show("hardware-acceleration")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.hardware_acceleration")}
            for="hardware-acceleration"
            description={t("settings.appearance.hardware_acceleration_description")}
        >
            {#snippet details()}
                {#if settings.hardwareAcceleration !== settings.hardwareAccelerationAtLaunch}
                    <Button variant="outline" size="sm" class="mt-1 self-start" onclick={() => void restartApp()}>
                        <RotateCw aria-hidden="true" />
                        {t("settings.appearance.restart_app")}
                    </Button>
                {/if}
            {/snippet}
            <Switch
                id="hardware-acceleration"
                checked={settings.hardwareAcceleration}
                onCheckedChange={(v) => settings.setHardwareAcceleration(v)}
            />
        </SettingRow>
    </Card>
{/if}
