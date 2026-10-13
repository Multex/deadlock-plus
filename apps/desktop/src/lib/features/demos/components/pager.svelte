<script lang="ts">
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";

    let { page = $bindable(0), count }: { page?: number; count: number } = $props();
</script>

<div class="flex items-center justify-center gap-3">
    <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onclick={() => page--}
        aria-label={t("demos.pager.previous")}
    >
        <ChevronLeft />
    </Button>
    <span class="text-sm text-muted-foreground">{t("demos.pager.page", { page: page + 1, count })}</span>
    <Button
        variant="outline"
        size="sm"
        disabled={page >= count - 1}
        onclick={() => page++}
        aria-label={t("demos.pager.next")}
    >
        <ChevronRight />
    </Button>
</div>
