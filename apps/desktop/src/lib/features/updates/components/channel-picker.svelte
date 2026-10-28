<script lang="ts">
    import { FlaskConical, Info, MoonStar, ShieldCheck, TriangleAlert } from "@lucide/svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { t } from "$lib/core/i18n.svelte";
    import { keepsCurrentBuild, UPDATE_CHANNELS, type UpdateChannel } from "../flow";

    type Props = {
        value: UpdateChannel;
        onchange: (channel: UpdateChannel) => void;
        currentVersion: string | null;
        /** `cards` lays the three channels side by side; `stack` lists them one under another for a narrow column. */
        variant?: "cards" | "stack";
        /** Hides the heading when the surrounding surface already names the picker. */
        showTitle?: boolean;
    };

    let { value, onchange, currentVersion, variant = "cards", showTitle = true }: Props = $props();

    const id = $props.id();
    const ICONS = { release: ShieldCheck, beta: FlaskConical, nightly: MoonStar } as const;

    let movedFrom = $state<UpdateChannel | null>(null);
    const keepsBuild = $derived(movedFrom !== null && currentVersion !== null && keepsCurrentBuild(movedFrom, value));

    function pick(next: UpdateChannel) {
        if (next === value) return;
        movedFrom = value;
        onchange(next);
    }

    function onkeydown(e: KeyboardEvent) {
        const next = radioTarget(e.key, UPDATE_CHANNELS.indexOf(value), UPDATE_CHANNELS.length);
        if (next === null) return;
        e.preventDefault();
        pick(UPDATE_CHANNELS[next]);
        const radios = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]");
        radios[next]?.focus();
    }
</script>

<div class="channel-picker" data-variant={variant}>
    {#if showTitle}
        <h3 id="{id}-title" class="title">{t("updates.channel.title")}</h3>
    {/if}
    <div
        role="radiogroup"
        tabindex="-1"
        aria-labelledby={showTitle ? `${id}-title` : undefined}
        aria-label={showTitle ? undefined : t("updates.channel.title")}
        class="options"
        {onkeydown}
    >
        {#each UPDATE_CHANNELS as channel (channel)}
            {@const Icon = ICONS[channel]}
            {@const checked = channel === value}
            <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-describedby="{id}-{channel}"
                tabindex={checked ? 0 : -1}
                class="option"
                data-channel={channel}
                onclick={() => pick(channel)}
            >
                <span class="head">
                    <Icon class="size-4 shrink-0" aria-hidden="true" />
                    <span class="name">{t(`updates.channel.${channel}.name`)}</span>
                </span>
                <span id="{id}-{channel}" class="body">{t(`updates.channel.${channel}.body`)}</span>
            </button>
        {/each}
    </div>

    {#if value === "nightly"}
        <p class="note warning" role="note">
            <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
            <span>{t("updates.channel.nightly_warning")}</span>
        </p>
    {/if}
    {#if keepsBuild && currentVersion}
        <p class="note" role="status">
            <Info class="size-4 shrink-0" aria-hidden="true" />
            <span
                >{t("updates.channel.keeps_build", {
                    version: currentVersion,
                    channel: t(`updates.channel.${value}.name`),
                })}</span
            >
        </p>
    {/if}
</div>

<style>
    .channel-picker {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
    }

    .title {
        font-family: var(--font-heading);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
        gap: 0.5rem;
    }

    .option {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding: 0.75rem 0.875rem;
        text-align: left;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: color-mix(in oklch, var(--card) 85%, var(--background));
        color: var(--muted-foreground);
        transition:
            border-color 150ms,
            background-color 150ms,
            color 150ms;
    }
    [data-variant="stack"] .options {
        grid-template-columns: minmax(0, 1fr);
    }
    [data-variant="stack"] .option {
        flex-direction: row;
        align-items: baseline;
        gap: 0.75rem;
        padding: 0.625rem 0.875rem;
    }
    [data-variant="stack"] .head {
        flex-shrink: 0;
        width: 6.5rem;
    }
    .option:hover {
        border-color: color-mix(in oklch, var(--brass) 50%, var(--border));
        color: var(--foreground);
    }
    .option[aria-checked="true"] {
        border-color: color-mix(in oklch, var(--brass) 75%, transparent);
        background: color-mix(in oklch, var(--brass) 10%, var(--card));
        color: var(--foreground);
        box-shadow:
            inset 0 -2px 0 var(--brass),
            inset 0 0 14px color-mix(in oklch, var(--brass) 16%, transparent);
    }
    .option[aria-checked="true"] :global(svg) {
        color: var(--brass);
    }
    .option[data-channel="nightly"][aria-checked="true"] {
        border-color: color-mix(in oklch, var(--warning) 70%, transparent);
        background: color-mix(in oklch, var(--warning) 8%, var(--card));
        box-shadow:
            inset 0 -2px 0 var(--warning),
            inset 0 0 14px color-mix(in oklch, var(--warning) 14%, transparent);
    }
    .option[data-channel="nightly"][aria-checked="true"] :global(svg) {
        color: var(--warning);
    }

    .head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .name {
        font-family: var(--font-heading);
        font-size: 0.95rem;
        font-weight: 600;
        letter-spacing: 0.04em;
    }

    .body {
        font-size: 0.8rem;
        line-height: 1.35;
        color: var(--muted-foreground);
    }

    .note {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        font-size: 0.8rem;
        color: var(--muted-foreground);
    }
    .note.warning {
        padding: 0.5rem 0.625rem;
        border: 1px solid color-mix(in oklch, var(--warning) 45%, transparent);
        border-radius: var(--radius);
        background: color-mix(in oklch, var(--warning) 8%, transparent);
        color: var(--foreground);
    }
    .note.warning :global(svg) {
        color: var(--warning);
    }
</style>
