<script lang="ts">
    import { Hourglass } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import type { ApiBusy } from "../api-busy.svelte";
    import { busyText } from "../busy-copy";

    let { busy }: { busy: ApiBusy } = $props();

    const text = $derived(busyText(busy.remainingS));
</script>

<EmptyState as="div" size="base" spacing="xl" role="status" data-api-busy>
    <p class="flex items-center justify-center gap-2">
        <Hourglass class="size-4 text-warning" aria-hidden="true" />
        {text}
    </p>
    {#snippet action()}
        <Button variant="outline" size="sm" disabled={busy.remainingS === null} onclick={() => busy.tryNow()}>
            {t("api_busy.try_now")}
        </Button>
    {/snippet}
</EmptyState>
