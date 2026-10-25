<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { Check } from "@lucide/svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { presenceStatus } from "../status.svelte";
    import { ALL_CLIENT_KINDS, runningKinds, toggleClient } from "../presence";

    const running = $derived(runningKinds(presenceStatus.status));

    const CLIENT_COLOR = {
        stable: "#5865f2",
        ptb: "#3ba5f5",
        canary: "#f0a232",
        other: "#8a8f98",
    } as const;
</script>

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
                        <span class="text-sm font-semibold"
                            >{t(`settings.discord.client_${kind === "other" ? "other_label" : kind}`)}</span
                        >
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
    </div>
</Card>
