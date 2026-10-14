<script lang="ts">
    import { toast } from "svelte-sonner";
    import { Copy, FileText, Save } from "@lucide/svelte";
    import { failureText } from "$lib/core/errors";
    import { saveTextFile } from "$lib/core/files";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { buildSupportReport } from "$lib/features/support-report/api";
    import { reportFileName } from "$lib/features/support-report/report";

    let report = $state<string | null>(null);
    let busy = $state(false);

    async function create() {
        busy = true;
        try {
            report = await buildSupportReport();
        } catch (e) {
            toast.error(failureText(e, t("support_report.build_failed")));
        } finally {
            busy = false;
        }
    }

    async function copy() {
        if (report === null) return;
        try {
            await navigator.clipboard.writeText(report);
            toast.success(t("support_report.copied"));
        } catch {
            toast.error(t("support_report.copy_failed"));
        }
    }

    async function save() {
        if (report === null) return;
        try {
            const saved = await saveTextFile(
                {
                    defaultName: reportFileName(new Date()),
                    filterName: t("support_report.save_filter"),
                    extension: "txt",
                },
                report,
            );
            if (saved) toast.success(t("support_report.saved"));
        } catch (e) {
            toast.error(failureText(e, t("support_report.save_failed")));
        }
    }
</script>

<Card as="section">
    <h2 class="font-heading text-sm font-semibold tracking-wide">{t("support_report.title")}</h2>
    <p class="mt-1 text-sm text-muted-foreground">{t("support_report.description")}</p>
    <p class="mt-1 text-xs text-muted-foreground">{t("support_report.included")}</p>
    <div class="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onclick={create} disabled={busy}>
            <FileText />
            {busy
                ? t("support_report.creating")
                : report === null
                  ? t("support_report.create")
                  : t("support_report.refresh")}
        </Button>
        {#if report !== null}
            <Button variant="outline" size="sm" onclick={copy}><Copy />{t("support_report.copy")}</Button>
            <Button variant="outline" size="sm" onclick={save}><Save />{t("support_report.save")}</Button>
        {/if}
    </div>
    {#if report !== null}
        <pre
            aria-label={t("support_report.preview")}
            class="mt-3 max-h-80 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words select-text">{report}</pre>
    {/if}
</Card>
