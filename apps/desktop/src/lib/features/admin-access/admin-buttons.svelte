<script lang="ts">
    import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { buttons } from "./buttons";

    type Props = {
        status: AdminAccessStatus | null;
        busy?: boolean;
        onallow: (always: boolean) => void;
    };

    let { status, busy = false, onallow }: Props = $props();

    const shown = $derived(status ? buttons(status) : null);
    const prompt = $derived(shown?.kind === "prompt" ? shown : null);
    const disabled = $derived(busy || (prompt !== null && prompt.disabled !== null));
</script>

{#if prompt}
    <div class="flex shrink-0 items-center gap-2">
        {#if prompt.disabled === "after_match"}
            <span class="text-xs text-muted-foreground">{t("admin_access.after_match")}</span>
        {/if}
        {#if prompt.allow}
            <Button size="sm" variant="outline" {disabled} onclick={() => onallow(false)}>
                {t("admin_access.allow")}
            </Button>
        {/if}
        <Button size="sm" {disabled} onclick={() => onallow(true)}>{t("admin_access.always_allow")}</Button>
    </div>
{/if}
