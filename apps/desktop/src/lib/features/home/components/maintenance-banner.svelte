<script lang="ts">
    import { Wrench } from "@lucide/svelte";

    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";

    type Props = {
        line: string;
        reminderOn: boolean;
        onopen: () => void;
    };

    let { line, reminderOn, onopen }: Props = $props();
</script>

<Button
    type="button"
    variant="unstyled"
    onclick={onopen}
    class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50"
>
    <Wrench class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0">
        <p class="font-heading text-sm font-semibold tracking-wide">{t("home.maintenance.title")}</p>
        <p class="text-xs text-muted-foreground">
            {t("home.maintenance.note", { line })}
            {reminderOn ? t("home.maintenance.reminder_on") : t("home.maintenance.reminder_off")}
        </p>
    </div>
</Button>
