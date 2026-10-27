<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { presenceStatus } from "../status.svelte";
    import {
        DELAY_RANGE,
        PRESENCE_LEVELS,
        delayLabel,
        delaySecsOf,
        discordBarState,
        runningLine,
        showsDeadlockPlusLogo,
    } from "../presence";

    const on = $derived(settings.presence.level !== "off");
    const line = $derived(on ? runningLine(on, presenceStatus.status) : "");
    const state = $derived(discordBarState(on, presenceStatus.status));

    function onLevelKeydown(e: KeyboardEvent) {
        const next = radioTarget(e.key, PRESENCE_LEVELS.indexOf(settings.presence.level), PRESENCE_LEVELS.length);
        if (next === null) return;
        e.preventDefault();
        settings.setPresence({ level: PRESENCE_LEVELS[next] });
        const radios =
            e.currentTarget instanceof HTMLElement
                ? (e.currentTarget.parentElement?.querySelectorAll("[role=radio]") ?? [])
                : [];
        (radios[next] as HTMLElement | undefined)?.focus();
    }
</script>

<Card as="section">
    <div class="flex flex-col gap-3">
        <div
            role="radiogroup"
            aria-label={t("settings.items.discord_presence")}
            class="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
            {#each PRESENCE_LEVELS as level (level)}
                {@const selected = settings.presence.level === level}
                <Button
                    variant="unstyled"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabindex={selected ? 0 : -1}
                    onkeydown={onLevelKeydown}
                    onclick={() => settings.setPresence({ level })}
                    class="flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {selected
                        ? 'border-brass bg-accent'
                        : ''}"
                >
                    <span class="text-sm font-semibold">{t(`settings.discord.level_${level}`)}</span>
                    <span class="text-xs font-normal text-muted-foreground">
                        {t(`settings.discord.level_${level}_description`)}
                    </span>
                </Button>
            {/each}
        </div>
        {#if line}
            <p class="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                    class="size-2 shrink-0 rounded-full {state === 'connected'
                        ? 'bg-success'
                        : state === 'waiting'
                          ? 'bg-muted-foreground/50'
                          : 'bg-warning'}"
                    aria-hidden="true"
                ></span>
                {line}
            </p>
        {/if}
        {#if on}
            <SettingRow
                class="border-t pt-3"
                label={t("settings.discord.support_label")}
                for="discord-support-button"
                description={t("settings.discord.support_description")}
            >
                <Switch
                    id="discord-support-button"
                    checked={settings.presence.supportButton}
                    onCheckedChange={(v) => settings.setPresence({ supportButton: v })}
                />
            </SettingRow>
            <SettingRow
                label={t("settings.discord.logo_label")}
                for="discord-deadlock-plus-logo"
                description={t("settings.discord.logo_description")}
            >
                <Switch
                    id="discord-deadlock-plus-logo"
                    checked={showsDeadlockPlusLogo(settings.presence)}
                    onCheckedChange={(v) => settings.setPresence({ deadlockPlusLogo: v })}
                />
            </SettingRow>
            <SettingRow label={t("settings.discord.delay_label")} description={t("settings.discord.delay_description")}>
                <div class="flex w-48 shrink-0 items-center gap-3">
                    <Slider
                        class="min-w-0 flex-1"
                        value={delaySecsOf(settings.presence)}
                        {...DELAY_RANGE}
                        formatValue={delayLabel}
                        bubble={false}
                        aria-label={t("settings.discord.delay_label")}
                        onValueChange={(v) => settings.setPresence({ delaySecs: v })}
                    />
                    <span
                        class="min-w-12 whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground"
                        aria-hidden="true"
                    >
                        {delayLabel(delaySecsOf(settings.presence))}
                    </span>
                </div>
            </SettingRow>
        {/if}
    </div>
</Card>
