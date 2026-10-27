<script lang="ts">
    import { Eraser } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { formatBytes } from "$lib/features/demos/demos";

    type Props = {
        total: number;
        incomplete: boolean;
        canClear: number;
        disabled: boolean;
        onclear: () => void;
    };

    let { total, incomplete, canClear, disabled, onclear }: Props = $props();
</script>

<Card as="section" radius="md" padding="none" class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
    <div class="flex gap-8">
        <div>
            <p class="text-xs text-muted-foreground">{t("storage.summary.total")}</p>
            <p class="text-2xl tabular-nums">
                {incomplete ? t("storage.summary.total_at_least", { size: formatBytes(total) }) : formatBytes(total)}
            </p>
        </div>
        <div>
            <p class="text-xs text-muted-foreground">{t("storage.summary.can_clear")}</p>
            <p class="text-2xl tabular-nums">{formatBytes(canClear)}</p>
        </div>
    </div>
    <Button variant="outline" {disabled} onclick={onclear}>
        <Eraser />
        {t("storage.summary.clear_regenerable")}
    </Button>
</Card>
