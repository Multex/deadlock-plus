<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Component } from "svelte";
    import { Monitor, Sparkles, Turtle } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { THEMES, resolveMotionPreference } from "$lib/features/settings/themes";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { t } from "$lib/core/i18n.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const MOTION_ICONS: Record<string, Component> = { system: Monitor, reduce: Turtle, full: Sparkles };
    const motionItems = $derived([
        { value: "system", label: t("settings.appearance.motion_system") },
        { value: "reduce", label: t("settings.appearance.motion_reduce") },
        { value: "full", label: t("settings.appearance.motion_full") },
    ]);

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
                ? (e.currentTarget.parentElement?.querySelectorAll("[role=radio]") ?? [])
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
                    {@const selected = settings.theme === theme.id}
                    <Button
                        variant="unstyled"
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabindex={selected ? 0 : -1}
                        onkeydown={onThemeKeydown}
                        onclick={() => settings.setTheme(theme.id)}
                        class="flex flex-col gap-2 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {selected
                            ? 'border-brass bg-accent'
                            : ''}"
                    >
                        <span class="flex h-6 overflow-hidden rounded border">
                            {#each theme.swatch as colour}
                                <span class="flex-1" style="background: {colour}"></span>
                            {/each}
                        </span>
                        <span class="text-sm font-semibold">{theme.label}</span>
                        <span class="text-xs text-muted-foreground">{theme.description}</span>
                    </Button>
                {/each}
            </div>
        </div>
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
