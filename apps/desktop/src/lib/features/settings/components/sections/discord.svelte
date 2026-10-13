<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { presenceStatus } from "$lib/features/presence/status.svelte";
    import {
        ALL_CLIENT_KINDS,
        PRESENCE_LEVELS,
        runningKinds,
        runningLine,
        toggleClient,
    } from "$lib/features/presence/presence";
    import { presenceConfigStore } from "$lib/features/presence/config.svelte";
    import PresenceEditor from "./presence-editor/presence-editor.svelte";
    import SyntaxCard from "./presence-editor/syntax-card.svelte";
    import { Check } from "@lucide/svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { t } from "$lib/core/i18n.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const running = $derived(runningKinds(presenceStatus.status));
    const line = $derived(runningLine(settings.presence.level !== "off", presenceStatus.status));

    const CLIENT_COLOR = {
        stable: "#5865f2",
        ptb: "#3ba5f5",
        canary: "#f0a232",
        other: "#8a8f98",
    } as const;

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

{#if show("discord-presence")}
    <Card as="section">
        <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
                <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.discord_presence")}</h3>
                <p class="text-sm text-muted-foreground">{t("settings.discord.presence_description")}</p>
            </div>
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
            {#if settings.presence.level !== "off"}
                <SettingRow
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
            {/if}
        </div>
    </Card>
{/if}

{#if show("discord-clients")}
    <Card as="section">
        <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
                <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.discord_clients")}</h3>
                <p class="text-sm text-muted-foreground">{t("settings.discord.clients_description")}</p>
            </div>
            <div role="group" aria-label={t("settings.items.discord_clients")} class="grid grid-cols-2 gap-2">
                {#each ALL_CLIENT_KINDS as kind (kind)}
                    {@const selected = settings.presence.clients.includes(kind)}
                    {@const isRunning = running.has(kind)}
                    <Button
                        variant="unstyled"
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onclick={() =>
                            settings.setPresence({ clients: toggleClient(settings.presence.clients, kind, !selected) })}
                        class="relative flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {selected
                            ? 'border-brass bg-accent'
                            : ''}"
                    >
                        <span
                            class="size-3 shrink-0 rounded-full transition-opacity {isRunning ? '' : 'opacity-40'}"
                            style:background-color={CLIENT_COLOR[kind]}
                            style:box-shadow={isRunning ? `0 0 8px ${CLIENT_COLOR[kind]}` : undefined}
                        ></span>
                        <span class="flex min-w-0 flex-col">
                            <span class="text-sm font-semibold">{t(`settings.discord.client_${kind}`)}</span>
                            <span class="truncate text-xs font-normal text-muted-foreground">
                                {kind === "other"
                                    ? t("settings.discord.client_other_hint")
                                    : isRunning
                                      ? t("settings.discord.client_running")
                                      : t("settings.discord.client_not_running")}
                            </span>
                        </span>
                        {#if selected}
                            <Check class="ml-auto size-4 shrink-0 text-brass" aria-hidden="true" />
                        {/if}
                    </Button>
                {/each}
            </div>
            {#if line}
                <p class="text-xs text-muted-foreground">{line}</p>
            {/if}
        </div>
    </Card>
{/if}

{#if show("discord-editor")}
    <Card as="section">
        <PresenceEditor />
    </Card>
    <Card as="section" id="pe-syntax" class="scroll-mt-4">
        <SyntaxCard placeholders={presenceConfigStore.placeholders} />
    </Card>
{/if}
