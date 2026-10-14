<script lang="ts">
    import { onMount, type Component } from "svelte";
    import { toast } from "svelte-sonner";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import { autostartTitle, getAutostart, setAutostart } from "$lib/features/settings/autostart";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { platform } from "$lib/core/platform";
    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { nextStep, previousStep, stepsFor, type IngestChoice } from "../onboarding";
    import { onboarding } from "../onboarding.svelte";
    import WelcomeStep from "./steps/welcome-step.svelte";
    import FeaturesStep from "./steps/features-step.svelte";
    import PermissionsStep from "./steps/permissions-step.svelte";
    import SteamStep from "./steps/steam-step.svelte";
    import SharingStep from "./steps/sharing-step.svelte";
    import ExtrasStep, { type Extras } from "./steps/extras-step.svelte";
    import DoneStep from "./steps/done-step.svelte";

    type Feature = { id: string; label: string; icon: Component<{ class?: string }> };

    let { features }: { features: Feature[] } = $props();

    const steps = $derived(stepsFor(platform));
    const last = $derived(steps.length - 1);

    let index = $state(0);
    let busy = $state(false);
    let extras = $state<Extras>({
        autostart: false,
        closeToTray: false,
        updateAlerts: false,
        maintenance: false,
        gcRecovery: false,
    });
    let autostartSupported = $state(true);
    let choice = $state<IngestChoice | null>(null);
    let forwardButton = $state<HTMLButtonElement | null>(null);

    const step = $derived(steps[index]);

    onMount(() => {
        void onboarding.load();
        getAutostart()
            .then((a) => (autostartSupported = a.supported))
            .catch(() => {});
    });

    function goBack() {
        index = previousStep(index);
        if (index === 0) forwardButton?.focus();
    }

    function goForward() {
        if (index < last) index = nextStep(index, steps.length);
        else void finish();
    }

    async function answer(value: IngestChoice) {
        choice = value;
        await settings.setMatchIngest(value === "share");
    }

    async function applyExtras() {
        if (extras.autostart && autostartSupported) {
            try {
                await setAutostart(true);
            } catch (e) {
                toast.error(failureText(e, t("onboarding.autostart_error", { name: autostartTitle() })));
            }
        }
        if (extras.closeToTray) await settings.setCloseToTray(true);
        if (extras.updateAlerts) await settings.setUpdateAlerts(true);
        if (extras.maintenance) await settings.setMaintenance({ enabled: true });
        if (extras.gcRecovery) await settings.setGcRecovery(true);
    }

    async function finish(target = "/") {
        if (busy) return;
        busy = true;
        try {
            await applyExtras();
            await onboarding.finish(target);
        } finally {
            busy = false;
        }
    }

    async function skip() {
        if (busy) return;
        busy = true;
        try {
            await onboarding.finish();
        } finally {
            busy = false;
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        void skip();
    }
</script>

<svelte:window onkeydown={onKeydown} />

<Page class="max-w-4xl justify-center gap-4 px-6 pb-10 pt-6">
    <div class="flex flex-col gap-5">
        <div class="flex items-center justify-between">
            <ol class="flex items-center gap-2" aria-label={t("onboarding.progress_label")}>
                {#each steps as s, i (s.id)}
                    <li
                        class="h-2 rounded-full transition-all {i === index
                            ? 'w-6 bg-primary'
                            : i < index
                              ? 'w-2 bg-primary/60'
                              : 'w-2 bg-border'}"
                        aria-current={i === index ? "step" : undefined}
                        title={s.title}
                    ></li>
                {/each}
            </ol>
            {#if index < last}
                <Button variant="ghost" size="sm" disabled={busy} onclick={skip}>{t("onboarding.skip")}</Button>
            {/if}
        </div>

        <div class="flex flex-col gap-4">
            {#if step.id === "welcome"}
                <WelcomeStep returning={onboarding.returning} game={onboarding.game} />
            {:else if step.id === "features"}
                <FeaturesStep {features} />
            {:else if step.id === "permissions"}
                <PermissionsStep {platform} elevated={onboarding.elevated} />
            {:else if step.id === "steam"}
                <SteamStep />
            {:else if step.id === "sharing"}
                <SharingStep {choice} onAnswer={answer} />
            {:else if step.id === "extras"}
                <ExtrasStep bind:extras {autostartSupported} />
            {:else}
                <DoneStep {busy} onGo={finish} />
            {/if}
        </div>

        <div class="flex items-center justify-between">
            <Button variant="ghost" disabled={busy || index === 0} onclick={goBack}>{t("onboarding.back")}</Button>
            <Button bind:ref={forwardButton} disabled={busy} onclick={goForward}>
                {index < last ? t("onboarding.next") : t("onboarding.finish")}
            </Button>
        </div>
    </div>
</Page>
