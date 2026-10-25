<script lang="ts">
    import { Clock, Gamepad2 } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
    import { formatElapsed, withDeadlockPlusLogo } from "./editor";

    let {
        card: sent,
        failed,
        supportButton,
        deadlockPlusLogo,
    }: { card: PresenceCard | null; failed: boolean; supportButton: boolean; deadlockPlusLogo: boolean } = $props();

    const card = $derived(sent && withDeadlockPlusLogo(sent, deadlockPlusLogo));
</script>

<div
    role="group"
    aria-label={t("settings.discord_editor.preview")}
    aria-live="polite"
    class="flex flex-col gap-2 rounded-md border bg-background p-3"
>
    <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t("settings.discord_editor.preview_header")}
    </p>
    {#if failed}
        <p class="text-sm text-destructive">{t("settings.discord_editor.preview_failed")}</p>
    {:else if card === null}
        <p class="text-sm text-muted-foreground">{t("settings.discord_editor.preview_disabled")}</p>
    {:else}
        <div class="flex gap-3">
            <div class="relative size-[72px] shrink-0">
                <div
                    class="flex size-full items-center justify-center rounded-lg bg-muted text-muted-foreground"
                    title={card.largeImage ? (card.largeText ?? undefined) : t("settings.discord_editor.preview_logo")}
                >
                    {#if card.largeImage}
                        <img src={card.largeImage} alt="" class="size-full rounded-lg object-cover object-top" />
                        <span class="sr-only">{t("settings.discord_editor.preview_large_image")}</span>
                    {:else}
                        <Gamepad2 class="size-7" aria-hidden="true" />
                        <span class="sr-only">{t("settings.discord_editor.preview_logo")}</span>
                    {/if}
                </div>
                {#if card.smallImage}
                    <div
                        class="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-secondary text-secondary-foreground"
                        title={card.smallText ?? undefined}
                    >
                        <img src={card.smallImage} alt="" class="size-full rounded-full object-cover" />
                        <span class="sr-only">{t("settings.discord_editor.preview_small_image")}</span>
                    </div>
                {/if}
            </div>
            <div class="flex min-w-0 flex-1 flex-col text-sm">
                <p class="font-semibold">{t("settings.discord_editor.preview_game")}</p>
                {#if card.details}
                    <p class="break-words">{card.details}</p>
                {/if}
                {#if card.state || card.party}
                    <p class="break-words">
                        {card.state ?? ""}
                        {#if card.party}
                            {t("settings.discord_editor.preview_party", { size: card.party[0], max: card.party[1] })}
                        {/if}
                    </p>
                {/if}
                {#if card.elapsedSecs !== null}
                    <p class="flex items-center gap-1 text-success">
                        <Clock class="size-3.5" aria-hidden="true" />
                        {t("settings.discord_editor.preview_elapsed", { time: formatElapsed(card.elapsedSecs) })}
                    </p>
                {/if}
            </div>
        </div>
        <div
            class="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground"
        >
            <Badge variant="outline">{t("settings.discord_editor.preview_discord_row")}</Badge>
            <span>{t("settings.discord_editor.preview_discord_sample")}</span>
        </div>
        {#if supportButton}
            <div
                class="flex h-8 items-center justify-center rounded-md bg-secondary text-sm font-medium text-secondary-foreground"
            >
                {t("settings.discord_editor.preview_support_button")}
            </div>
        {/if}
        {#if card.largeText && card.largeImage}
            <p class="text-xs text-muted-foreground break-words">
                {t("settings.discord_editor.preview_large_text", { text: card.largeText })}
            </p>
        {/if}
        {#if card.smallText && card.smallImage}
            <p class="text-xs text-muted-foreground break-words">
                {t("settings.discord_editor.preview_small_text", { text: card.smallText })}
            </p>
        {/if}
    {/if}
</div>
