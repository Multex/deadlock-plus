<script lang="ts">
    import { onMount } from "svelte";
    import { Play, ShieldAlert, Square } from "@lucide/svelte";

    import { errorText } from "$lib/core/errors";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";

    import AdminButtons from "$lib/features/admin-access/admin-buttons.svelte";
    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import FrameLayerSetup from "$lib/features/performance/components/frame-layer-setup.svelte";
    import { frameCapture } from "$lib/features/performance/frames.svelte";
    import { addonTitle, formatDuration, frameCaptureNote, framePolyline } from "$lib/features/performance/performance";
    import { savedRuns } from "$lib/features/performance/runs.svelte";
    import { performanceScan } from "$lib/features/performance/scan.svelte";
    import { platform } from "$lib/core/platform";

    const GRAPH_W = 600;
    const GRAPH_H = 120;
    const MIN_CEILING_MS = 33.3;

    const status = $derived(frameCapture.status);
    const result = $derived(frameCapture.result);
    const recent = $derived(status?.recentFrametimesMs ?? []);
    const ceiling = $derived(Math.max(MIN_CEILING_MS, ...recent));
    const noFrames = $derived(status?.state === "capturing" && status.frames === 0 && status.elapsedMs > 5000);
    const failure = $derived(status?.state === "failed" ? status.error : null);
    const needsAdmin = $derived(
        failure === "diagnostics.frame_trace_needs_admin" && adminAccess.buttons.kind === "prompt",
    );
    let adminMessage = $state<string | null>(null);

    async function toggleCapture() {
        adminMessage = null;
        await (frameCapture.active ? frameCapture.stop() : frameCapture.start());
    }

    async function allowAdmin(always: boolean) {
        adminMessage = null;
        const { retry, message } = await adminAccess.allow(always);
        adminMessage = message;
        if (retry) {
            await frameCapture.stop();
            await frameCapture.start();
        }
    }

    let label = $state("");
    let savedResult = $state.raw<typeof result>(null);
    const enabledAddons = $derived(
        performanceScan.addons
            .filter((a) => a.enabled !== false)
            .map((a) => addonTitle(a, performanceScan.scans[a.fileName])),
    );
    const saved = $derived(result !== null && savedResult === result);

    async function saveRun() {
        if (!result) return;
        const snapshot = result;
        if (await savedRuns.save(label, enabledAddons, snapshot)) {
            savedResult = snapshot;
            label = "";
        }
    }

    onMount(() => void savedRuns.load());

    const fixed = (v: number, digits: number) =>
        formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
    const ms = (v: number) => fixed(v, 2);
    const fps = (v: number) => fixed(v, 0);
    const inMs = (v: number) => t("performance.units.ms", { value: ms(v) });
</script>

{#snippet stat(label: string, value: string)}
    <Card radius="md" padding="row">
        <p class="font-heading text-2xl font-semibold">{value}</p>
        <p class="text-xs text-muted-foreground">{label}</p>
    </Card>
{/snippet}

<div class="flex flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
        <p class="text-sm text-muted-foreground">
            {t("performance.frametimes.intro")}
            {frameCaptureNote(platform)}
        </p>
        <Button
            variant={frameCapture.active ? "outline" : "default"}
            size="sm"
            disabled={platform === "macos"}
            onclick={toggleCapture}
        >
            {#if frameCapture.active}<Square aria-hidden="true" /> {t("performance.frametimes.stop")}{:else}<Play
                    aria-hidden="true"
                />
                {t("performance.frametimes.start")}{/if}
        </Button>
    </div>

    {#if platform === "linux"}
        <FrameLayerSetup />
    {/if}

    {#if frameCapture.error}
        <p class="text-sm text-destructive">{frameCapture.error}</p>
    {/if}
    {#if needsAdmin}
        <div
            role="alert"
            class="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
            <span class="flex items-center gap-2">
                <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
                {t("performance.frametimes.needs_admin")}
            </span>
            <AdminButtons status={adminAccess.status} busy={adminAccess.busy} onallow={allowAdmin} />
        </div>
    {:else if failure}
        <p class="text-sm text-destructive">{errorText({ code: failure, params: {} })}</p>
    {/if}
    {#if adminMessage}
        <p class="text-sm text-muted-foreground">{adminMessage}</p>
    {/if}

    {#if frameCapture.active && status}
        <Card radius="md" padding="row" class="flex flex-col gap-3">
            <div class="flex items-center justify-between text-sm">
                <span>
                    {#if status.state === "waitingForGame"}
                        {t("performance.frametimes.waiting")}
                    {:else}
                        {tn("performance.frametimes.recording", status.frames, {
                            time: formatDuration(status.elapsedMs),
                        })}
                    {/if}
                </span>
                {#if !status.gameFocused && status.state === "capturing"}
                    <span class="text-xs text-warning">{t("performance.frametimes.background")}</span>
                {/if}
                {#if status.truncated}<span class="text-xs text-warning">{t("performance.frametimes.limit")}</span>{/if}
            </div>
            {#if recent.length > 1}
                <svg
                    viewBox="0 0 {GRAPH_W} {GRAPH_H}"
                    class="h-32 w-full"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <polyline
                        points={framePolyline(recent, GRAPH_W, GRAPH_H, ceiling)}
                        fill="none"
                        stroke="currentColor"
                        class="text-brass"
                        stroke-width="1.5"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>
                <p class="text-xs text-muted-foreground">
                    {tn("performance.frametimes.graph_caption", recent.length, { ms: fps(ceiling) })}
                </p>
            {/if}
            {#if noFrames}
                <p class="text-sm text-warning">
                    {t("performance.frametimes.no_frames")}
                </p>
            {/if}
        </Card>
    {/if}

    {#if result}
        {#if result.frameCount === 0}
            <p class="text-sm text-muted-foreground">{t("performance.frametimes.none_recorded")}</p>
        {:else}
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {@render stat(t("performance.metrics.avg_fps"), fps(1000 / result.avgMs))}
                {@render stat(t("performance.metrics.low_1pct_fps"), fps(result.low1pctFps))}
                {@render stat(t("performance.metrics.low_01pct_fps"), fps(result.low01pctFps))}
                {@render stat(t("performance.metrics.spikes"), formatNumber(result.spikes.length))}
                {@render stat(t("performance.metrics.median_frametime"), inMs(result.medianMs))}
                {@render stat(t("performance.metrics.p95"), inMs(result.p95Ms))}
                {@render stat(t("performance.metrics.p99"), inMs(result.p99Ms))}
                {@render stat(t("performance.metrics.longest_frame"), inMs(result.maxMs))}
            </div>
            <p class="text-xs text-muted-foreground">
                {tn("performance.frametimes.summary", result.frameCount, {
                    time: formatDuration(result.durationMs),
                })}
                {#if result.backgroundMs >= 1000}
                    {t("performance.frametimes.left_out", { time: formatDuration(result.backgroundMs) })}
                {/if}
            </p>
            <Card radius="md" padding="row" class="flex flex-col gap-2">
                <p class="text-sm">
                    {tn("performance.frametimes.save_hint", enabledAddons.length)}
                </p>
                <div class="flex gap-2">
                    <Input
                        bind:value={label}
                        aria-label={t("performance.frametimes.label_aria")}
                        placeholder={t("performance.frametimes.label_placeholder")}
                        maxlength={60}
                        disabled={saved}
                    />
                    <Button size="sm" onclick={saveRun} disabled={saved}
                        >{saved ? t("performance.frametimes.saved") : t("performance.frametimes.save")}</Button
                    >
                </div>
                {#if savedRuns.error}<p class="text-sm text-destructive">{savedRuns.error}</p>{/if}
            </Card>
            {#if result.spikes.length > 0}
                <ul class="flex flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
                    {#each result.spikes.slice(0, 50) as spike}
                        <li class="flex justify-between px-4 py-2">
                            <span class="font-mono">{inMs(spike.frametimeMs)}</span>
                            <span class="text-muted-foreground"
                                >{t("performance.frametimes.spike_at", { time: formatDuration(spike.atMs) })}</span
                            >
                        </li>
                    {/each}
                </ul>
            {/if}
        {/if}
    {/if}
</div>
