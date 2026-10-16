<script lang="ts">
    import { errorText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { toast } from "svelte-sonner";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import { MonitorPlay, TriangleAlert } from "@lucide/svelte";
    import PositionPicker from "@deadlock-plus/ui/position-picker.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { onOverlayStatus, overlayStatus, showOverlayTest } from "$lib/features/settings/api";
    import {
        DURATION_RANGE,
        NO_GAME,
        OVERLAY_POSITIONS,
        type OverlayPosition,
        type OverlayStatus,
    } from "$lib/features/settings/overlay";

    let { show }: { show: (id: string) => boolean } = $props();

    // Display only: the backend does the waiting, so the window can lose focus without the toast slipping.
    const TEST_DELAY_SECS = 3;
    const OVERLAY_IDS = ["overlay", "overlay-position", "overlay-duration", "overlay-test"];

    const positionLabels = $derived<Record<OverlayPosition, string>>({
        topLeft: t("settings.notifications.position.top_left"),
        topCenter: t("settings.notifications.position.top_center"),
        topRight: t("settings.notifications.position.top_right"),
        left: t("settings.notifications.position.left"),
        right: t("settings.notifications.position.right"),
        bottomLeft: t("settings.notifications.position.bottom_left"),
        bottomCenter: t("settings.notifications.position.bottom_center"),
        bottomRight: t("settings.notifications.position.bottom_right"),
    });
    const positionOptions = $derived(OVERLAY_POSITIONS.map((value) => ({ value, label: positionLabels[value] })));
    const seconds = (value: number) => t("settings.notifications.overlay_seconds", { seconds: value });

    let status = $state<OverlayStatus>(NO_GAME);
    let testing = $state(false);
    let countdown = $state(TEST_DELAY_SECS);

    $effect(() => {
        let alive = true;
        let unlisten: (() => void) | undefined;
        onOverlayStatus((next) => (status = next))
            .then((stop) => (alive ? (unlisten = stop) : stop()))
            .catch(() => {});
        overlayStatus()
            .then((next) => alive && (status = next))
            .catch(() => {});
        return () => {
            alive = false;
            unlisten?.();
        };
    });

    async function showTest() {
        testing = true;
        countdown = TEST_DELAY_SECS;
        const timer = setInterval(() => (countdown = Math.max(1, countdown - 1)), 1000);
        try {
            await showOverlayTest();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            clearInterval(timer);
            testing = false;
        }
    }
</script>

{#if OVERLAY_IDS.some(show)}
    <Card as="section" class="flex flex-col gap-4">
        {#if show("overlay")}
            <SettingRow
                label={t("settings.items.overlay")}
                for="overlay"
                description={t("settings.notifications.overlay_description")}
            >
                {#snippet details()}
                    {#if status.exclusiveFullscreen}
                        <p class="flex items-start gap-1.5 text-xs text-warning">
                            <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            {t("settings.notifications.overlay_fullscreen")}
                        </p>
                    {/if}
                {/snippet}
                <Switch
                    id="overlay"
                    checked={settings.overlay.enabled}
                    onCheckedChange={(v) => settings.setOverlay({ enabled: v })}
                />
            </SettingRow>
        {/if}
        {#if show("overlay-position")}
            <SettingRow
                label={t("settings.items.overlay_position")}
                description={t("settings.notifications.overlay_position_description")}
                size="sub"
            >
                <PositionPicker
                    options={positionOptions}
                    value={settings.overlay.position}
                    centerLabel={t("settings.notifications.position.center")}
                    aria-label={t("settings.items.overlay_position")}
                    onValueChange={(v) => settings.setOverlay({ position: v })}
                />
            </SettingRow>
        {/if}
        {#if show("overlay-duration")}
            <SettingRow
                label={t("settings.items.overlay_duration")}
                description={t("settings.notifications.overlay_duration_description")}
                size="sub"
            >
                <div class="flex w-48 shrink-0 items-center gap-3">
                    <Slider
                        class="min-w-0 flex-1"
                        value={settings.overlay.durationSecs}
                        {...DURATION_RANGE}
                        ticks
                        formatValue={seconds}
                        bubble={false}
                        aria-label={t("settings.items.overlay_duration")}
                        onValueChange={(v) => settings.setOverlay({ durationSecs: v })}
                    />
                    <span class="w-8 text-right text-sm tabular-nums text-muted-foreground" aria-hidden="true">
                        {seconds(settings.overlay.durationSecs)}
                    </span>
                </div>
            </SettingRow>
        {/if}
        {#if show("overlay-test")}
            <SettingRow
                label={t("settings.items.overlay_test")}
                description={t("settings.notifications.overlay_test_description")}
                hint={status.gameOpen ? undefined : t("errors.overlay.game_not_running")}
                size="sub"
            >
                <Button
                    variant="outline"
                    size="sm"
                    class="shrink-0"
                    disabled={!status.gameOpen || testing}
                    onclick={showTest}
                >
                    <MonitorPlay aria-hidden="true" />
                    {testing
                        ? t("settings.notifications.overlay_test_countdown", { seconds: countdown })
                        : t("settings.notifications.overlay_test_button")}
                </Button>
            </SettingRow>
        {/if}
    </Card>
{/if}
