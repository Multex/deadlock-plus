<script lang="ts">
    import { toast } from "svelte-sonner";
    import { openUrl } from "$lib/core/opener";
    import { ExternalLink, Info, Scale } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { APP_LICENSE, disclaimer, LICENSES } from "$lib/features/settings/licenses";
    import DependencyLicenses from "$lib/features/settings/components/dependency-licenses.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    function open(url: string) {
        openUrl(url).catch((e) => toast.error(t("settings.licenses.open_failed", { error: String(e) })));
    }
</script>

{#if show("licenses")}
    <div class="flex flex-col gap-4">
        <Card as="section" padding="lg">
            <div class="flex items-start gap-4">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Scale class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 class="font-heading text-base font-semibold tracking-wide">{APP_LICENSE.name}</h2>
                        <Badge variant="success">{APP_LICENSE.spdx}</Badge>
                    </div>
                    <p class="mt-2 text-sm text-muted-foreground">{APP_LICENSE.summary} {APP_LICENSE.warranty}</p>
                    <button
                        type="button"
                        class="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        onclick={() => open(APP_LICENSE.url)}
                    >
                        {t("settings.licenses.read_full")}
                        <ExternalLink class="size-3.5" />
                    </button>
                </div>
            </div>
        </Card>

        <section class="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            <Info class="mt-0.5 size-4 shrink-0" />
            <p>{disclaimer()}</p>
        </section>

        <section>
            <h3 class="mb-2 px-1 text-xs uppercase tracking-widest text-muted-foreground/70">
                {t("settings.licenses.fonts_heading")}
            </h3>
            <ul class="grid gap-3 sm:grid-cols-2">
                {#each LICENSES as license (license.name)}
                    <Card as="li" class="flex flex-col">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold">{license.name}</p>
                                <p class="text-xs text-muted-foreground">{license.kind}</p>
                            </div>
                            <Badge variant={license.tone === "open" ? "success" : "warning"}>{license.license}</Badge>
                        </div>
                        <p class="mt-3 text-xs text-muted-foreground">{license.owner}</p>
                        <p class="mt-1 text-xs text-muted-foreground/80">{license.terms}</p>
                        {#if license.url}
                            <button
                                type="button"
                                class="mt-2 inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                                onclick={() => open(license.url!)}
                            >
                                {t("settings.licenses.terms_link")}
                                <ExternalLink class="size-3" />
                            </button>
                        {/if}
                        <details class="mt-3 border-t border-border/60 pt-2">
                            <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                                >{t("settings.licenses.copyright")}</summary
                            >
                            <p class="mt-2 text-xs text-muted-foreground/80 select-text">{license.notice}</p>
                        </details>
                    </Card>
                {/each}
            </ul>
        </section>

        <DependencyLicenses />
    </div>
{/if}
