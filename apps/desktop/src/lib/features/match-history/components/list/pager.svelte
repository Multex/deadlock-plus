<script lang="ts">
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";

    let { page, pageCount, onpage }: { page: number; pageCount: number; onpage: (page: number) => void } = $props();
</script>

<nav class="flex items-center justify-center gap-3" aria-label={t("match_history.list.pager.label")}>
    <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onclick={() => onpage(page - 1)}
        aria-label={t("demos.pager.previous")}
    >
        <ChevronLeft />
    </Button>
    <span class="text-sm text-muted-foreground" aria-live="polite">
        {t("demos.pager.page", { page, count: pageCount })}
    </span>
    <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onclick={() => onpage(page + 1)}
        aria-label={t("demos.pager.next")}
    >
        <ChevronRight />
    </Button>
</nav>
