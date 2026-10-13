<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import type { AddonInfo, AddonScan } from "../api";
    import { addonTitle } from "../performance";

    type Props = {
        addon: AddonInfo;
        scan?: AddonScan;
    };

    let { addon, scan }: Props = $props();
</script>

<div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium">{addonTitle(addon, scan)}</p>
    <p class="truncate text-xs text-muted-foreground">
        {addon.fileName}{addon.modId ? ` · ${t("performance.addon.mod_id", { id: addon.modId })}` : ""}
    </p>
</div>
{#if addon.enabled === false}<Badge variant="outline">{t("performance.addon.disabled")}</Badge>{/if}
