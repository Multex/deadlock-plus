<script lang="ts">
    import { goto } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import { Bug, Copy, RotateCcw, TriangleAlert } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { errorReport, errorSummary } from "../report";

    let { error, route, status, onretry }: { error: unknown; route: string; status?: number; onretry: () => void } =
        $props();

    async function copyDetails() {
        try {
            await navigator.clipboard.writeText(errorReport(error, { route, status }));
            toast.success(t("error_page.copied"));
        } catch {
            toast.error(t("error_page.copy_failed"));
        }
    }
</script>

<div class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
    <TriangleAlert class="size-10 text-destructive" aria-hidden="true" />
    <div class="flex max-w-md flex-col gap-1">
        <h1 class="font-heading text-lg font-semibold tracking-wide">{t("error_page.title")}</h1>
        <p class="text-sm text-muted-foreground">{t("error_page.body")}</p>
        <p class="mt-2 break-words rounded-md border bg-card px-3 py-2 font-mono text-xs">
            {status ? `${status}: ` : ""}{errorSummary(error)}
        </p>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
        <Button onclick={onretry}>
            <RotateCcw />
            {t("error_page.retry")}
        </Button>
        <Button variant="outline" onclick={copyDetails}>
            <Copy />
            {t("error_page.copy")}
        </Button>
        <Button variant="outline" onclick={() => goto("/settings/diagnostics")}>
            <Bug />
            {t("error_page.open_logs")}
        </Button>
    </div>
</div>
