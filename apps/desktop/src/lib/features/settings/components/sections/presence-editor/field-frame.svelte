<script lang="ts">
    import type { Snippet } from "svelte";
    import { RotateCcw } from "@lucide/svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { t } from "$lib/core/i18n.svelte";

    let {
        id,
        label,
        custom,
        onreset,
        children,
    }: { id: string; label: string; custom: boolean; onreset: () => void; children: Snippet } = $props();
</script>

<div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
        <label for={id} class="text-sm font-medium">{label}</label>
        <div class="flex items-center gap-1">
            <span class="text-xs text-muted-foreground">
                {custom ? t("settings.discord_editor.customised") : t("settings.discord_editor.inherited")}
            </span>
            {#if custom}
                <IconButton
                    label={t("settings.discord_editor.reset_field", { field: label })}
                    tooltip
                    size="icon"
                    class="size-7"
                    onclick={onreset}
                >
                    <RotateCcw />
                </IconButton>
            {/if}
        </div>
    </div>
    {@render children()}
</div>
