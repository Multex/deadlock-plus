<script lang="ts">
    import { Download, X } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { installUpdate, updateBanner } from "../banner.svelte";
    import { updateSurface } from "../update-surface.svelte";
    import { updater } from "../updater.svelte";
</script>

{#if updateBanner.visible}
    <div role="status" class="flex items-center gap-3 border-b border-border bg-muted px-4 py-2">
        <Download class="size-4 shrink-0 text-brass" />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{t("updates.banner.title", { version: updater.version ?? "" })}</p>
            <p class="text-xs text-muted-foreground">{t("updates.banner.body")}</p>
        </div>
        <Button size="sm" variant="outline" onclick={() => updateSurface.show()}>
            {t("updates.about.view")}
        </Button>
        <Button size="sm" onclick={() => installUpdate("banner")}>
            <Download />
            {t("updates.banner.install")}
        </Button>
        <IconButton label={t("updates.banner.dismiss")} tooltip size="sm" onclick={() => updateBanner.dismiss()}>
            <X />
        </IconButton>
    </div>
{/if}
