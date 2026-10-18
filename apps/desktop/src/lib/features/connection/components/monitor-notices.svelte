<script lang="ts">
    import { ShieldAlert, TriangleAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import AdminButtons from "$lib/features/admin-access/admin-buttons.svelte";
    import { traceErrorText } from "../connection";
    import type { NetworkSnapshot } from "../types";

    type Props = {
        snap: NetworkSnapshot | null;
        onretry: () => void | Promise<void>;
    };

    let { snap, onretry }: Props = $props();

    const needsPermission = $derived(Boolean(snap?.needsPermission && !snap.traceError));
    const askAdmin = $derived(adminAccess.buttons.kind === "prompt");
    let message = $state<string | null>(null);
    let cancelled = $state(false);
    let restarting = $state(false);

    async function allow(always: boolean) {
        message = null;
        cancelled = false;
        const result = await adminAccess.allow(always);
        if (!result.retry) {
            message = result.message;
            cancelled = result.kind === "cancelled";
            return;
        }
        // The card goes away once the monitor traces, so a message that comes with a retry must outlive it.
        if (result.message) toast.warning(result.message);
        restarting = true;
        try {
            await onretry();
        } finally {
            restarting = false;
        }
    }
</script>

{#if needsPermission && askAdmin}
    <div class="flex items-center gap-3.5 rounded-lg border border-warning/40 bg-card px-4 py-3.5" role="alert">
        <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <ShieldAlert class="size-5" aria-hidden="true" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="text-sm font-medium">{t("connection.notices.admin_title")}</p>
            <p class="text-[13px] text-muted-foreground">{t("connection.notices.admin_body")}</p>
            {#if message}<p class="text-[13px] {cancelled ? 'text-muted-foreground' : 'text-warning'}" role="status">
                    {message}
                </p>{/if}
        </div>
        <AdminButtons status={adminAccess.status} busy={adminAccess.busy || restarting} onallow={allow} />
    </div>
{:else if needsPermission}
    <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span>
            {t("connection.notices.permission")}
        </span>
        <Button size="sm" onclick={onretry}>{t("connection.notices.allow")}</Button>
    </div>
{/if}

{#if snap?.traceError}
    <div
        role="alert"
        class="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
        <span class="flex items-center gap-2"
            ><TriangleAlert class="size-4 shrink-0" />{traceErrorText(snap.traceError)}</span
        >
        <Button size="sm" variant="outline" onclick={onretry}>{t("connection.notices.retry")}</Button>
    </div>
{/if}
