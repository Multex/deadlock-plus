<script lang="ts">
    import { Search, Volume2 } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";

    let {
        value = $bindable(),
        selectedCount,
        disabled,
        onunmute,
    }: { value: string; selectedCount: number; disabled: boolean; onunmute: () => void } = $props();
</script>

<div class="flex items-center gap-2">
    <div class="relative flex-1">
        <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
        />
        <Input
            bind:value
            placeholder={t("voice_bans.filter.placeholder")}
            aria-label={t("voice_bans.filter.aria")}
            class="pl-8"
        />
    </div>
    <Button variant="outline" size="sm" disabled={selectedCount === 0 || disabled} onclick={onunmute}>
        <Volume2 />
        {t("voice_bans.filter.unmute_selected", { count: selectedCount })}
    </Button>
</div>
