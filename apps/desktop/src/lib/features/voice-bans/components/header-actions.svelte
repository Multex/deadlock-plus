<script lang="ts">
    import { Download, Upload } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";

    let {
        importDisabled,
        exportDisabled,
        exportLabel,
        onimport,
        onexport,
    }: {
        importDisabled: boolean;
        exportDisabled: boolean;
        exportLabel: string;
        onimport: (file: File) => void;
        onexport: () => void;
    } = $props();

    let fileInput: HTMLInputElement;

    function onchange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const chosen = input.files?.[0];
        input.value = "";
        if (chosen) onimport(chosen);
    }
</script>

<Button variant="outline" size="sm" onclick={() => fileInput.click()} disabled={importDisabled}>
    <Upload />
    {t("voice_bans.import")}
</Button>
<Button variant="outline" size="sm" onclick={onexport} disabled={exportDisabled}>
    <Download />
    {exportLabel}
</Button>
<input bind:this={fileInput} type="file" accept=".json,.dt,text/plain,application/json" class="hidden" {onchange} />
