<script lang="ts">
    import { ShieldAlert } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
</script>

<div class="flex items-center gap-3.5 rounded-lg border border-warning/40 bg-card px-4 py-3.5" role="alert">
    <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
        <ShieldAlert class="size-5" aria-hidden="true" />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-sm font-medium">{t("live.game_admin.title")}</p>
        <p class="text-[13px] text-muted-foreground">{t("live.game_admin.body")}</p>
    </div>
</div>
