<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";

    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { NetworkSnapshot } from "../types";

    type Props = {
        snap: NetworkSnapshot | null;
        onretry: () => void;
    };

    let { snap, onretry }: Props = $props();
</script>

{#if snap?.needsPermission && !snap.traceError}
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
        <span class="flex items-center gap-2"><TriangleAlert class="size-4 shrink-0" />{snap.traceError}</span>
        <Button size="sm" variant="outline" onclick={onretry}>{t("connection.notices.retry")}</Button>
    </div>
{/if}
