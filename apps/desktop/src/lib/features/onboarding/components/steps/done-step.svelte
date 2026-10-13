<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";

    let { busy, onGo }: { busy: boolean; onGo: (target: string) => void } = $props();
</script>

<h1 class="font-heading text-3xl font-bold tracking-wide">{t("onboarding.done.title")}</h1>
<p class="text-muted-foreground">{t("onboarding.done.body")}</p>
<div class="flex flex-wrap gap-2">
    <Button variant="outline" disabled={busy} onclick={() => onGo("/")}>{t("onboarding.done.home")}</Button>
    <Button variant="outline" disabled={busy} onclick={() => onGo("/settings")}>{t("onboarding.done.settings")}</Button>
    <Button variant="outline" disabled={busy} onclick={() => onGo("/whats-new")}
        >{t("onboarding.done.whats_new")}</Button
    >
</div>
