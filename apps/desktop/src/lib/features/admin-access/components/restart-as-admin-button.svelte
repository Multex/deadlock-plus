<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { restartAsAdminAction } from "../restart.svelte";
</script>

<div class="flex shrink-0 flex-col items-end gap-1">
    <Button size="sm" disabled={restartAsAdminAction.pending} onclick={() => restartAsAdminAction.run()}>
        {t("admin_access.game_admin.restart")}
    </Button>
    {#if restartAsAdminAction.error}
        <p class="text-xs text-destructive" role="status">{restartAsAdminAction.error}</p>
    {/if}
</div>
