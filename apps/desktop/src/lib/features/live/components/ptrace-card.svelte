<script lang="ts">
    import { ShieldAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import Button from "@deadlock-plus/ui/button.svelte";
    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { fixPtrace, type PtraceNotice } from "../ptrace";

    let { notice, onapplied }: { notice: PtraceNotice; onapplied: () => void } = $props();

    let busy = $state(false);

    async function fix() {
        busy = true;
        try {
            if (await fixPtrace()) onapplied();
        } catch (e) {
            toast.error(failureText(e, t("live.ptrace.failed")));
        } finally {
            busy = false;
        }
    }
</script>

<div class="flex items-center gap-3.5 rounded-lg border border-warning/40 bg-card px-4 py-3.5" role="alert">
    <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
        <ShieldAlert class="size-5" aria-hidden="true" />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-sm font-medium">{t("live.ptrace.title")}</p>
        <p class="text-[13px] text-muted-foreground">{t("live.ptrace.body")}</p>
        {#if notice.note}<p class="text-[13px] text-muted-foreground">{t(notice.note)}</p>{/if}
    </div>
    {#if notice.action}
        <Button size="sm" class="shrink-0" disabled={busy} onclick={fix}>{t(notice.action)}</Button>
    {/if}
</div>
