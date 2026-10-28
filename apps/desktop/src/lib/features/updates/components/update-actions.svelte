<script lang="ts">
    import { Download, ExternalLink, RefreshCw, RotateCw } from "@lucide/svelte";
    import type { Snippet } from "svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { failureStep } from "../flow";
    import type { UpdateSurface } from "../surface.svelte";

    type Props = {
        surface: UpdateSurface;
        size?: "default" | "sm" | "lg";
        /** Rendered after the stage's own buttons, e.g. a dialog's Later. */
        extra?: Snippet;
    };

    let { surface, size = "default", extra }: Props = $props();

    const stage = $derived(surface.stage);
    const failure = $derived(failureStep(surface.source));
</script>

<div class="flex flex-wrap items-center gap-2">
    {#if stage === "available"}
        <Button {size} onclick={() => void surface.download()}>
            <Download />
            {t("updates.surface.action.update")}
        </Button>
    {:else if stage === "ready"}
        <Button {size} onclick={() => void surface.restart()}>
            <RotateCw />
            {t("updates.surface.action.restart")}
        </Button>
    {:else if stage === "failed"}
        <Button {size} onclick={() => void surface.retry()}>
            <RefreshCw />
            {t("updates.surface.action.retry")}
        </Button>
        {#if failure === "download"}
            <Button {size} variant="outline" onclick={() => surface.openManualDownload()}>
                <ExternalLink />
                {t("updates.surface.action.manual")}
            </Button>
        {/if}
    {:else if stage !== "downloading"}
        <Button {size} variant="outline" disabled={stage === "checking"} onclick={() => void surface.check()}>
            <RefreshCw class={stage === "checking" ? "animate-spin" : ""} />
            {t("updates.surface.action.check")}
        </Button>
    {/if}
    {@render extra?.()}
</div>
