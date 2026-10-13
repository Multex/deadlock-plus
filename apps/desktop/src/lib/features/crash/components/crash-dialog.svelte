<script lang="ts">
    import { onMount } from "svelte";
    import { afterNavigate, beforeNavigate } from "$app/navigation";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { attachNote, crashDetail, crashHeading, crashTimeLabel, shouldShowCrash } from "../crash-dialog";
    import { crashPrompt } from "../crash-prompt.svelte";

    let open = $state(false);
    let navigating = false;

    const report = $derived(crashPrompt.report);

    function visibleAt(pathname: string, closed = crashPrompt.closed) {
        return shouldShowCrash({
            report: crashPrompt.report,
            pathname,
            dismissed: crashPrompt.dismissed,
            closed,
        });
    }

    function onOpenChange(next: boolean) {
        if (next) return;
        // A page switch closes every dialog; that must not count as the user waving it away.
        if (!navigating) crashPrompt.closed = true;
    }

    async function dismiss() {
        if (await crashPrompt.dismiss()) open = false;
    }

    beforeNavigate(() => (navigating = true));

    afterNavigate((nav) => {
        navigating = false;
        // Reopen only when leaving onboarding or What's New; a switch between normal pages closes it for good.
        const from = nav.from?.url?.pathname;
        const fromHidden = !from || !visibleAt(from, false);
        if (fromHidden) open = visibleAt(location.pathname);
    });

    onMount(async () => {
        await crashPrompt.init();
        open = visibleAt(location.pathname);
    });
</script>

{#if report}
    <Dialog.Root bind:open {onOpenChange}>
        <Dialog.Content>
            <div class="flex flex-col gap-1.5">
                <Dialog.Title>{crashHeading(report.kind)}</Dialog.Title>
                <Dialog.Description>{crashDetail(report.kind)}</Dialog.Description>
            </div>

            <p class="text-xs text-muted-foreground">
                {t("crash.meta", { time: crashTimeLabel(report.timestampMs), version: report.version, os: report.os })}
            </p>

            {#if report.message}
                <pre
                    class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs">{report.message}</pre>
            {/if}

            <p class="text-xs text-muted-foreground">
                {t("crash.privacy")}
            </p>

            {#if crashPrompt.reportPath}
                <p class="break-all text-sm" role="status">{attachNote(crashPrompt.reportPath)}</p>
            {/if}

            <div class="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" disabled={crashPrompt.busy} onclick={dismiss}>{t("crash.dismiss")}</Button>
                <Button variant="outline" disabled={crashPrompt.busy} onclick={() => crashPrompt.reveal()}>
                    {t("crash.open_folder")}
                </Button>
                <Button disabled={crashPrompt.busy} onclick={() => crashPrompt.openIssue()}>
                    {t("crash.report_github")}
                </Button>
            </div>
        </Dialog.Content>
    </Dialog.Root>
{/if}
