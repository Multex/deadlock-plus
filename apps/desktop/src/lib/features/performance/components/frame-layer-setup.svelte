<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Copy } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";

    import { frameLayer } from "$lib/features/performance/layer.svelte";

    const status = $derived(frameLayer.status);

    async function copyLaunchOption() {
        if (!status) return;
        try {
            await navigator.clipboard.writeText(status.launchOption);
            toast.success(t("performance.layer.copied"));
        } catch {
            toast.error(t("performance.layer.copy_failed"));
        }
    }

    onMount(() => void frameLayer.load());
</script>

{#if status?.supported}
    <Card radius="md" padding="row" class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-4">
            <div class="flex flex-col gap-1">
                <p class="text-sm font-medium">
                    {status.installed ? t("performance.layer.installed") : t("performance.layer.not_installed")}
                </p>
                <p class="text-xs text-muted-foreground">
                    {#if status.installed}
                        {t("performance.layer.installed_hint")}
                    {:else if status.libraryAvailable}
                        {t("performance.layer.install_hint")}
                    {:else}
                        {t("performance.layer.unavailable")}
                    {/if}
                </p>
            </div>
            {#if status.installed}
                <Button variant="outline" size="sm" disabled={frameLayer.busy} onclick={() => frameLayer.uninstall()}>
                    {t("performance.layer.remove")}
                </Button>
            {:else}
                <Button
                    size="sm"
                    disabled={frameLayer.busy || !status.libraryAvailable}
                    onclick={() => frameLayer.install()}
                >
                    {t("performance.layer.install")}
                </Button>
            {/if}
        </div>
        <div class="flex flex-col gap-1">
            <p class="text-xs text-muted-foreground">
                {t("performance.layer.steps")}
            </p>
            <div class="flex items-center gap-2">
                <code class="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                    {status.launchOption}
                </code>
                <Button variant="outline" size="sm" onclick={copyLaunchOption}
                    ><Copy /> {t("performance.layer.copy")}</Button
                >
            </div>
        </div>
        {#if frameLayer.error}<p class="text-sm text-destructive">{frameLayer.error}</p>{/if}
    </Card>
{/if}
