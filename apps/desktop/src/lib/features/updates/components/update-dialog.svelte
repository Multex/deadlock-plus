<script lang="ts">
    import { ChevronRight, X } from "@lucide/svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { aboutInfo } from "$lib/features/settings/about-info.svelte";
    import { stageBody, stageKicker } from "../copy";
    import type { UpdateSurface } from "../surface.svelte";
    import ChannelPicker from "./channel-picker.svelte";
    import UpdateActions from "./update-actions.svelte";
    import UpdateHighlights from "./update-highlights.svelte";
    import UpdateProgress from "./update-progress.svelte";

    let { surface }: { surface: UpdateSurface } = $props();

    const source = $derived(surface.source);
    const stage = $derived(surface.stage);
    const current = $derived(aboutInfo.info?.appVersion ?? null);
    const showsUpdate = $derived(
        source.version !== null &&
            (stage === "available" || stage === "downloading" || stage === "ready" || stage === "failed"),
    );
</script>

<Dialog.Root open={surface.open} onOpenChange={(open) => (surface.open = open)}>
    <Dialog.Content class="slip max-w-2xl gap-0 overflow-hidden p-0">
        <header class="slip-head">
            <div class="min-w-0">
                <p class="kicker">{stageKicker(source)}</p>
                <Dialog.Title class="slip-title">
                    {showsUpdate && source.version
                        ? t("updates.surface.version_title", { version: source.version })
                        : t("updates.surface.title")}
                </Dialog.Title>
                {#if showsUpdate && current}
                    <p class="from">{t("updates.surface.from_version", { version: current })}</p>
                {/if}
            </div>
            <IconButton label={t("updates.surface.close")} tooltip size="sm" onclick={() => (surface.open = false)}>
                <X />
            </IconButton>
        </header>

        <div class="slip-body" data-has-notes={showsUpdate}>
            {#if showsUpdate && source.version}
                <UpdateHighlights version={source.version} notes={source.notes} channel={surface.channel} />
            {/if}

            <div class="status">
                <Dialog.Description class="text-sm text-muted-foreground">
                    <span aria-live="polite">{stageBody(source, current)}</span>
                </Dialog.Description>
                {#if stage === "downloading" || stage === "ready"}
                    <UpdateProgress {source} pinnedRate={surface.pinnedRate} />
                {/if}
            </div>
        </div>

        <footer class="slip-foot">
            <details class="channel">
                <summary>
                    <ChevronRight class="chev size-3.5" aria-hidden="true" />
                    {t("updates.channel.summary", { channel: t(`updates.channel.${surface.channel}.name`) })}
                </summary>
                <div class="pt-3">
                    <ChannelPicker
                        value={surface.channel}
                        onchange={(c) => surface.setChannel(c)}
                        currentVersion={current}
                        showTitle={false}
                    />
                </div>
            </details>
            <UpdateActions {surface}>
                {#snippet extra()}
                    {#if stage !== "upToDate" && stage !== "idle" && stage !== "checking"}
                        <Button variant="ghost" onclick={() => (surface.open = false)}>
                            {t("updates.surface.action.later")}
                        </Button>
                    {/if}
                {/snippet}
            </UpdateActions>
        </footer>
    </Dialog.Content>
</Dialog.Root>

<style>
    :global(.slip) {
        border-color: color-mix(in oklch, var(--brass) 40%, var(--border)) !important;
    }

    /* The game's item tooltip header: a torn top edge over dark diagonal bands. */
    .slip-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 1.25rem 1.25rem 1rem;
        clip-path: polygon(
            0 5px,
            8% 1px,
            17% 6px,
            29% 0,
            41% 4px,
            55% 1px,
            68% 5px,
            80% 0,
            91% 3px,
            100% 0,
            100% 100%,
            0 100%
        );
        background:
            repeating-linear-gradient(
                -32deg,
                transparent 0 22px,
                color-mix(in oklch, var(--brass) 6%, transparent) 22px 30px,
                transparent 30px 58px
            ),
            linear-gradient(100deg, color-mix(in oklch, var(--brass) 16%, var(--card)), var(--card));
        border-bottom: 2px solid color-mix(in oklch, var(--brass) 55%, transparent);
    }

    .kicker {
        font-family: var(--font-heading);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--brass);
    }

    :global(.slip-title) {
        margin-top: 0.125rem;
        font-family: var(--font-heading);
        font-size: 1.75rem !important;
        font-weight: 600;
        letter-spacing: 0.03em;
        line-height: 1.1;
        text-shadow: 0 2px 0 rgb(0 0 0 / 0.25);
    }

    .from {
        margin-top: 0.25rem;
        font-size: 0.8rem;
        color: var(--muted-foreground);
    }

    .slip-body {
        display: grid;
        gap: 1.25rem;
        padding: 1.25rem;
        overflow-y: auto;
        min-height: 0;
    }
    @media (min-width: 44rem) {
        .slip-body[data-has-notes="true"] {
            grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        }
    }

    .status {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .slip-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem 1rem;
        padding: 0.875rem 1.25rem 1rem;
        border-top: 1px solid var(--border);
        background: color-mix(in oklch, var(--foreground) 3%, var(--card));
    }

    .channel {
        flex: 1 1 16rem;
        min-width: 0;
    }
    .channel summary {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        min-height: 2.25rem;
        list-style: none;
        font-size: 0.85rem;
        color: var(--muted-foreground);
    }
    .channel summary::-webkit-details-marker {
        display: none;
    }
    .channel summary:hover {
        color: var(--foreground);
    }
    .channel[open] :global(.chev) {
        transform: rotate(90deg);
    }
    .channel[open] {
        flex-basis: 100%;
    }
</style>
