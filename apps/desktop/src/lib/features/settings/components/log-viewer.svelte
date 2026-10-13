<script lang="ts">
    import { Maximize2, Minimize2 } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import LogView from "$lib/features/logging/components/log-view.svelte";
    import { settingsUi } from "$lib/features/settings/ui.svelte";

    const expanded = $derived(settingsUi.logsExpanded);

    // Expanding remounts this component; without this the dialog's focus trap
    // falls back to the first sidebar button and pops its tooltip.
    function restoreFocus(node: HTMLElement) {
        if (!settingsUi.restoreLogsToggleFocus) return;
        settingsUi.restoreLogsToggleFocus = false;
        node.focus();
    }
</script>

<Card as="section" class={expanded ? "flex h-full min-h-0 flex-col" : ""}>
    <div class="flex items-start justify-between gap-4">
        <div>
            <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.diagnostics")}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                {t("settings.diagnostics.description")}
            </p>
        </div>
        <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            onclick={() => settingsUi.toggleLogsExpanded()}
            {@attach restoreFocus}
        >
            {#if expanded}
                <Minimize2 />
                {t("settings.diagnostics.collapse")}
            {:else}
                <Maximize2 />
                {t("settings.diagnostics.expand")}
            {/if}
        </Button>
    </div>
    <div class="mt-3 {expanded ? 'min-h-0 flex-1' : ''}">
        <LogView full={expanded} />
    </div>
</Card>
