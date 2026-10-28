<script lang="ts">
    import { Check } from "@lucide/svelte";
    import { Popover } from "bits-ui";
    import { t } from "$lib/core/i18n.svelte";
    import { aboutInfo } from "$lib/features/settings/about-info.svelte";
    import { stageBody, stageKicker } from "../copy";
    import { stepStates, type IndicatorKind } from "../flow";
    import type { UpdateSurface } from "../surface.svelte";
    import ChannelPicker from "./channel-picker.svelte";
    import IndicatorFace from "./indicator-face.svelte";
    import UpdateActions from "./update-actions.svelte";
    import UpdateHighlights from "./update-highlights.svelte";
    import UpdateProgress from "./update-progress.svelte";

    type Props = { surface: UpdateSurface; kind: IndicatorKind | "idle"; label: string };

    let { surface, kind, label }: Props = $props();

    const id = $props.id();
    const source = $derived(surface.source);
    const stage = $derived(surface.stage);
    const current = $derived(aboutInfo.info?.appVersion ?? null);
    const steps = $derived(stepStates(stage));
    const STEP_KEYS = ["download", "restart", "notes"] as const;

    let body = $state<HTMLElement | null>(null);

    // Without an action to take (mid-download), focus waits on the drawer itself instead of a release notes link.
    function focusAction(e: Event) {
        e.preventDefault();
        const action = body?.querySelector<HTMLElement>(".actions button:not(:disabled)");
        (action ?? body?.closest<HTMLElement>(".drawer"))?.focus();
    }
    const showsUpdate = $derived(
        stage === "available" ||
            stage === "downloading" ||
            stage === "ready" ||
            (stage === "failed" && source.version !== null),
    );
</script>

<Popover.Root open={surface.open} onOpenChange={(open) => (surface.open = open)}>
    <Popover.Trigger
        class="flex h-full items-center px-2 transition-colors hover:bg-accent/60"
        aria-label={label}
        title={label}
    >
        <IndicatorFace {kind} {source} />
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            align="end"
            sideOffset={2}
            collisionPadding={8}
            aria-labelledby="{id}-title"
            onOpenAutoFocus={focusAction}
            tabindex={-1}
            class="drawer z-(--z-popover) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
            <header class="drawer-head">
                <p class="kicker">{stageKicker(source)}</p>
                <h2 id="{id}-title" class="version">
                    {showsUpdate && source.version
                        ? t("updates.surface.version_title", { version: source.version })
                        : t("updates.surface.title")}
                </h2>
                {#if showsUpdate && current}
                    <p class="from">{t("updates.surface.from_version", { version: current })}</p>
                {/if}
            </header>

            <div class="drawer-body" bind:this={body}>
                {#if showsUpdate}
                    <ol class="rail" aria-label={t("updates.steps.label")}>
                        {#each STEP_KEYS as key, i (key)}
                            {@const state = steps[i]}
                            {@const name = t(`updates.steps.${key}`)}
                            <li data-state={state} aria-current={state === "current" ? "step" : undefined}>
                                <span class="dot" aria-hidden="true">
                                    {#if state === "done"}<Check class="size-3" />{:else}{i + 1}{/if}
                                </span>
                                <span class="step-name" aria-hidden="true">{name}</span>
                                <span class="sr-only">
                                    {state === "done"
                                        ? t("updates.steps.done", { step: name })
                                        : state === "current"
                                          ? t("updates.steps.current", { step: name })
                                          : name}
                                </span>
                            </li>
                        {/each}
                    </ol>
                {/if}

                <p class="body" aria-live="polite">{stageBody(source, current)}</p>

                {#if stage === "downloading" || stage === "ready"}
                    <UpdateProgress {source} pinnedRate={surface.pinnedRate} size="sm" />
                {/if}

                <div class="actions"><UpdateActions {surface} size="sm" /></div>

                {#if showsUpdate && source.version}
                    <UpdateHighlights
                        version={source.version}
                        notes={source.notes}
                        channel={surface.channel}
                        variant="list"
                        limit={3}
                    />
                {/if}
            </div>

            <footer class="drawer-foot">
                <ChannelPicker
                    value={surface.channel}
                    onchange={(c) => surface.setChannel(c)}
                    currentVersion={current}
                    variant="row"
                />
            </footer>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    :global(.drawer) {
        display: flex;
        flex-direction: column;
        width: min(23rem, calc(100vw - 1rem));
        max-height: calc(100vh - 3.5rem);
        overflow-y: auto;
        border: 1px solid color-mix(in oklch, var(--brass) 40%, var(--border));
        border-radius: var(--radius);
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow:
            0 12px 32px rgb(0 0 0 / 0.45),
            0 0 0 1px rgb(0 0 0 / 0.2);
    }

    .drawer-head {
        position: relative;
        padding: 0.875rem 1rem 0.75rem;
        background:
            repeating-linear-gradient(
                -32deg,
                transparent 0 22px,
                color-mix(in oklch, var(--brass) 5%, transparent) 22px 30px,
                transparent 30px 58px
            ),
            linear-gradient(100deg, color-mix(in oklch, var(--brass) 14%, var(--popover)), var(--popover));
        border-bottom: 1px solid color-mix(in oklch, var(--brass) 35%, var(--border));
    }

    .kicker {
        font-family: var(--font-heading);
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .version {
        margin-top: 0.125rem;
        font-family: var(--font-heading);
        font-size: 1.35rem;
        font-weight: 600;
        letter-spacing: 0.03em;
        line-height: 1.15;
    }

    .from {
        font-size: 0.78rem;
        color: var(--muted-foreground);
    }

    .drawer-body {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
        padding: 0.875rem 1rem;
    }

    .rail {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.25rem;
    }
    .rail li {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.72rem;
        color: var(--muted-foreground);
    }
    /* The rule joining one step to the next. */
    .rail li + li::before {
        content: "";
        position: absolute;
        top: 0.625rem;
        right: calc(50% + 0.875rem);
        width: calc(100% - 1.5rem);
        height: 1px;
        background: var(--border);
    }
    .rail li[data-state="done"] + li::before,
    .rail li[data-state="current"]::before {
        background: var(--brass);
    }

    .dot {
        display: grid;
        place-items: center;
        width: 1.25rem;
        height: 1.25rem;
        border: 1px solid var(--border);
        border-radius: 999px;
        font-family: var(--font-heading);
        font-size: 0.68rem;
        font-weight: 600;
    }
    li[data-state="current"] .dot {
        border-color: var(--brass);
        color: var(--brass);
        box-shadow: 0 0 0 3px color-mix(in oklch, var(--brass) 18%, transparent);
    }
    li[data-state="done"] .dot {
        border-color: var(--brass);
        background: var(--brass);
        color: var(--background);
    }
    li[data-state="current"] .step-name,
    li[data-state="done"] .step-name {
        color: var(--foreground);
    }

    .body {
        font-size: 0.85rem;
        color: var(--muted-foreground);
    }

    .drawer-foot {
        padding: 0.75rem 1rem 0.875rem;
        border-top: 1px solid var(--border);
        background: color-mix(in oklch, var(--foreground) 3%, var(--popover));
    }
</style>
