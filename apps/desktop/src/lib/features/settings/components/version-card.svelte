<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { toast } from "svelte-sonner";
    import { Copy } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { aboutGroups, aboutText } from "$lib/features/settings/about";
    import { aboutInfo } from "$lib/features/settings/about-info.svelte";

    const info = $derived(aboutInfo.info);

    async function copyInfo() {
        if (!info) return;
        try {
            await navigator.clipboard.writeText(aboutText(info));
            toast.success(t("settings.about_page.copied"));
        } catch {
            toast.error(t("settings.about_page.copy_failed"));
        }
    }
</script>

{#if aboutInfo.status === "error"}
    <Card as="section">
        <RegionError
            name="about-version"
            size="sm"
            title={t("settings.about_page.version_error")}
            body={t("region.error_body")}
            retryLabel={t("region.retry")}
            onretry={() => void aboutInfo.load()}
        />
    </Card>
{:else if info}
    <Card as="section">
        <div class="flex items-center justify-between gap-4">
            <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.version")}</h2>
            <div class="flex items-center gap-2">
                <SupportButton />
                <Button variant="outline" size="sm" onclick={copyInfo}>
                    <Copy />
                    {t("settings.about_page.copy")}
                </Button>
            </div>
        </div>
        <div class="mt-3 flex flex-col gap-4">
            {#each aboutGroups(info) as group (group.title)}
                <div>
                    <h3 class="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{group.title}</h3>
                    <dl class="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-1 text-sm">
                        {#each group.rows as [label, value] (label)}
                            <dt class="text-muted-foreground">{label}</dt>
                            <dd class="min-w-0 break-words select-text">{value}</dd>
                        {/each}
                    </dl>
                </div>
            {/each}
        </div>
    </Card>
{/if}
