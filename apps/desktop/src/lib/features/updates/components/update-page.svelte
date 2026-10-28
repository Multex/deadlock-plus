<script lang="ts">
    import { onMount } from "svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { aboutInfo } from "$lib/features/settings/about-info.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { stageBody, stageKicker } from "../copy";
    import { byteProgress, failureStep, releaseHighlights } from "../flow";
    import { whatsNew } from "../whats-new.svelte";
    import type { UpdateSurface } from "../surface.svelte";
    import ChannelPicker from "./channel-picker.svelte";
    import ReleaseHistory from "./release-history.svelte";
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
    const numeral = $derived(showsUpdate ? source.version : current);
    const body = $derived(stageBody(source, current));
    const hasHighlights = $derived(
        showsUpdate && source.version !== null && releaseHighlights(source.version, source.notes).headlines.length > 0,
    );
    // A finished download of unknown size has nothing to measure, so the bar only shows while it means something.
    const showsProgress = $derived(
        stage === "downloading" || (stage === "ready" && byteProgress(source).total !== null),
    );
    // The store's message is worded for the user; it only adds something when it says more than the body does.
    const checkDetail = $derived.by(() => {
        const message = failureStep(source) === "check" ? source.checkError?.message : undefined;
        return message && message !== t("updates.status.check_failed") ? message : null;
    });

    onMount(() => {
        if (!aboutInfo.info) void aboutInfo.load();
    });
</script>

<Page class="max-w-5xl">
    <h1 class="sr-only">{t("updates.surface.title")}</h1>

    <section class="sheet" data-stage={stage} aria-labelledby="update-plate-version">
        <div class="plate">
            <p class="kicker">{stageKicker(source)}</p>
            {#if numeral}
                <p id="update-plate-version" class="numeral">
                    <span class="brand">Deadlock+</span>
                    <span class="digits">{numeral}</span>
                </p>
            {:else}
                <p id="update-plate-version" class="numeral"><span class="brand">Deadlock+</span></p>
            {/if}
            <div class="meta">
                {#if showsUpdate && current}
                    <span>{t("updates.surface.from_version", { version: current })}</span>
                {/if}
                <span class="badge" data-channel={surface.channel}>{t(`updates.channel.${surface.channel}.name`)}</span>
            </div>

            <p class="body" aria-live="polite">{body}</p>
            {#if checkDetail}<p class="detail">{checkDetail}</p>{/if}

            {#if showsProgress}
                <UpdateProgress {source} />
            {/if}

            <UpdateActions {surface} size="lg" />
        </div>

        {#if hasHighlights && source.version}
            <div class="ledger">
                <UpdateHighlights version={source.version} notes={source.notes} channel={surface.channel} />
            </div>
        {/if}
    </section>

    <div class="lower" data-has-history={whatsNew.history.length > 0 && current !== null}>
        {#if whatsNew.history.length > 0 && current}
            <div class="panel">
                <ReleaseHistory history={whatsNew.history} {current} />
            </div>
        {/if}
        <div class="panel channels">
            <ChannelPicker
                value={surface.channel}
                onchange={(c) => surface.setChannel(c)}
                currentVersion={current}
                variant={whatsNew.history.length > 0 && current ? "stack" : "cards"}
            />
            <SettingRow
                class="border-t pt-4"
                label={t("settings.about_page.auto_check_label")}
                for="updates-auto-check"
                description={t("settings.about_page.auto_check_description")}
            >
                <Switch
                    id="updates-auto-check"
                    checked={settings.autoUpdateCheck}
                    onCheckedChange={(v) => settings.setAutoUpdateCheck(v)}
                />
            </SettingRow>
        </div>
    </div>
</Page>

<style>
    .sheet {
        position: relative;
        display: grid;
        overflow: hidden;
        border: 1px solid color-mix(in oklch, var(--brass) 35%, var(--border));
        border-radius: var(--radius);
        background:
            radial-gradient(90% 70% at 15% 0%, color-mix(in oklch, var(--brass) 10%, transparent), transparent 70%),
            var(--card);
        box-shadow:
            inset 0 1px 0 color-mix(in oklch, var(--brass) 25%, transparent),
            0 10px 30px rgb(0 0 0 / 0.25);
    }
    /* Art deco corner marks, like the trim on the game's menus. */
    .sheet::before,
    .sheet::after {
        content: "";
        position: absolute;
        width: 1.5rem;
        height: 1.5rem;
        border-color: color-mix(in oklch, var(--brass) 70%, transparent);
        border-style: solid;
        pointer-events: none;
    }
    .sheet::before {
        top: 0.5rem;
        left: 0.5rem;
        border-width: 2px 0 0 2px;
    }
    .sheet::after {
        right: 0.5rem;
        bottom: 0.5rem;
        border-width: 0 2px 2px 0;
    }

    @media (min-width: 52rem) {
        .sheet:has(.ledger) {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        }
        .ledger {
            border-top: 0 !important;
            border-left: 1px solid color-mix(in oklch, var(--brass) 25%, var(--border));
        }
    }

    .plate {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
        padding: 1.75rem 1.75rem 1.5rem;
    }

    .kicker {
        font-family: var(--font-heading);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .numeral {
        display: flex;
        flex-direction: column;
        line-height: 1;
    }
    .brand {
        font-family: var(--font-heading);
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }
    .digits {
        margin-top: 0.25rem;
        font-family: "Valve Pulp", var(--font-heading);
        font-size: clamp(2.75rem, 7vw, 4.5rem);
        letter-spacing: 0.01em;
        color: var(--foreground);
        background: linear-gradient(
            180deg,
            color-mix(in oklch, var(--brass) 40%, var(--foreground)) 0%,
            var(--brass) 100%
        );
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
    }
    [data-stage="upToDate"] .digits,
    [data-stage="idle"] .digits,
    [data-stage="checking"] .digits {
        background: none;
        -webkit-text-fill-color: currentColor;
    }

    .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.75rem;
        font-size: 0.85rem;
        color: var(--muted-foreground);
    }

    .badge {
        padding: 0.125rem 0.5rem;
        border: 1px solid color-mix(in oklch, var(--brass) 50%, transparent);
        border-radius: 999px;
        font-family: var(--font-heading);
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--brass);
    }
    .badge[data-channel="nightly"] {
        border-color: color-mix(in oklch, var(--warning) 60%, transparent);
        color: var(--warning);
    }

    .body {
        max-width: 34rem;
        font-size: 0.95rem;
        color: var(--muted-foreground);
    }

    .ledger {
        padding: 1.75rem;
        border-top: 1px solid color-mix(in oklch, var(--brass) 25%, var(--border));
        background: color-mix(in oklch, var(--foreground) 2%, transparent);
    }

    .detail {
        margin-top: -0.375rem;
        font-size: 0.8rem;
        color: var(--muted-foreground);
    }

    .lower {
        display: grid;
        gap: 1.25rem;
    }
    @media (min-width: 52rem) {
        .lower[data-has-history="true"] {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            align-items: start;
        }
    }

    .panel {
        padding: 1.25rem 1.5rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);
    }

    .channels {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
</style>
