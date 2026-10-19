<script lang="ts">
    import { ShieldAlert } from "@lucide/svelte";
    import { page } from "$app/state";
    import { t } from "$lib/core/i18n.svelte";
    import { adminAccess } from "../admin-access.svelte";
    import { showGameAdminBanner } from "../game-admin-banner";
    import RestartAsAdminButton from "./restart-as-admin-button.svelte";
</script>

{#if showGameAdminBanner(adminAccess.status, page.url.pathname)}
    <div role="alert" class="flex items-center gap-3 border-b border-border bg-muted px-4 py-2">
        <ShieldAlert class="size-4 shrink-0 text-warning" aria-hidden="true" />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{t("admin_access.game_admin.title")}</p>
            <p class="text-xs text-muted-foreground">{t("admin_access.game_admin.body")}</p>
        </div>
        <RestartAsAdminButton />
    </div>
{/if}
