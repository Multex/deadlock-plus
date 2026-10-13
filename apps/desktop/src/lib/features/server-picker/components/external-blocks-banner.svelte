<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";

    let {
        ruleCount,
        regionCount,
        label,
        importing,
        onImport,
    }: {
        ruleCount: number;
        regionCount: number;
        label: string;
        importing: boolean;
        onImport: () => void;
    } = $props();
</script>

<Card radius="md" padding="none" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
    <span>
        {t("server_picker.external.summary", {
            rules: tn("server_picker.external.rules", ruleCount, { label }),
            regions: tn("server_picker.external.regions", regionCount),
        })}
    </span>
    <Button size="sm" onclick={onImport} disabled={importing}>{t("server_picker.external.import")}</Button>
</Card>
