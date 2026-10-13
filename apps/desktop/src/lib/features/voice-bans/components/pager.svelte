<script lang="ts">
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";

    let { page = $bindable(), pageCount }: { page: number; pageCount: number } = $props();
</script>

<div class="flex items-center justify-center gap-3">
    <IconButton variant="outline" label={t("voice_bans.pager.previous")} disabled={page === 0} onclick={() => page--}>
        <ChevronLeft />
    </IconButton>
    <span class="text-sm text-muted-foreground">{t("voice_bans.pager.page", { page: page + 1, count: pageCount })}</span
    >
    <IconButton
        variant="outline"
        label={t("voice_bans.pager.next")}
        disabled={page >= pageCount - 1}
        onclick={() => page++}
    >
        <ChevronRight />
    </IconButton>
</div>
