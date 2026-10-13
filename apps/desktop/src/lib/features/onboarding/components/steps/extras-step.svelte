<script lang="ts" module>
    export interface Extras {
        autostart: boolean;
        closeToTray: boolean;
        updateAlerts: boolean;
        maintenance: boolean;
        gcRecovery: boolean;
    }
</script>

<script lang="ts">
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { autostartTitle } from "$lib/features/settings/autostart";

    let { extras = $bindable(), autostartSupported }: { extras: Extras; autostartSupported: boolean } = $props();
</script>

{#snippet extra(id: string, label: string, note: string, checked: boolean, set: (v: boolean) => void)}
    <Card padding="sm" class="flex items-center justify-between gap-4">
        <div class="flex flex-col gap-0.5">
            <label for={id} class="font-heading text-sm font-semibold tracking-wide">{label}</label>
            <p class="text-xs text-muted-foreground">{note}</p>
        </div>
        <Switch {id} {checked} onCheckedChange={set} />
    </Card>
{/snippet}

<h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.extras.title")}</h1>
<p class="text-muted-foreground">{t("onboarding.extras.intro")}</p>
<div class="flex flex-col gap-2">
    {#if autostartSupported}
        {@render extra(
            "ob-autostart",
            autostartTitle(),
            t("onboarding.extras.autostart_note"),
            extras.autostart,
            (v) => (extras.autostart = v),
        )}
    {/if}
    {@render extra(
        "ob-tray",
        t("onboarding.extras.tray"),
        t("onboarding.extras.tray_note"),
        extras.closeToTray,
        (v) => (extras.closeToTray = v),
    )}
    {@render extra(
        "ob-alerts",
        t("onboarding.extras.alerts"),
        t("onboarding.extras.alerts_note"),
        extras.updateAlerts,
        (v) => (extras.updateAlerts = v),
    )}
    {@render extra(
        "ob-maintenance",
        t("onboarding.extras.maintenance"),
        t("onboarding.extras.maintenance_note"),
        extras.maintenance,
        (v) => (extras.maintenance = v),
    )}
    {@render extra(
        "ob-gc-recovery",
        t("onboarding.extras.gc_recovery"),
        t("onboarding.extras.gc_recovery_note"),
        extras.gcRecovery,
        (v) => (extras.gcRecovery = v),
    )}
</div>
<p class="text-xs text-muted-foreground">
    {t("onboarding.extras.footer")}
</p>
