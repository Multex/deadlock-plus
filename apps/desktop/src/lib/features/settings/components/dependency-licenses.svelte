<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import { summarize, type DependencyLicenses } from "../dependencies";

    let data = $state<DependencyLicenses | null>(null);
    let failed = $state(false);

    const summary = $derived(data ? summarize(data) : null);

    async function load() {
        if (data || failed) return;
        try {
            data = (await import("$lib/generated/dependency-licenses.json")).default as DependencyLicenses;
        } catch {
            failed = true;
        }
    }
</script>

<details class="group rounded-lg border bg-card" ontoggle={(e) => e.currentTarget.open && load()}>
    <summary class="flex cursor-pointer items-center gap-3 p-4">
        <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <div class="min-w-0">
            <p class="text-sm font-semibold">{t("settings.licenses.dependencies_title")}</p>
            <p class="text-xs text-muted-foreground">{t("settings.licenses.dependencies_description")}</p>
        </div>
    </summary>

    <div class="border-t border-border/60 p-4">
        {#if failed}
            <p class="text-xs text-destructive">{t("settings.licenses.dependencies_failed")}</p>
        {:else if !data || !summary}
            <p class="text-xs text-muted-foreground">{t("settings.licenses.dependencies_loading")}</p>
        {:else}
            <div class="grid grid-cols-3 gap-3">
                {#each [[t("settings.licenses.dependencies_packages"), summary.packages], [t("settings.licenses.dependencies_rust"), summary.rust], [t("settings.licenses.dependencies_npm"), summary.npm]] as [label, value] (label)}
                    <div class="rounded-md bg-muted/40 px-3 py-2">
                        <p class="font-heading text-lg font-semibold">{value}</p>
                        <p class="text-xs text-muted-foreground">{label}</p>
                    </div>
                {/each}
            </div>

            <div class="mt-4 flex flex-col gap-2">
                {#each data.groups as group, i (i)}
                    <details class="group/item rounded-md border border-border/60">
                        <summary class="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                            <ChevronRight
                                class="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-90"
                            />
                            <span class="min-w-0 flex-1 truncate text-sm font-medium">{group.title}</span>
                            <Badge variant="secondary">{group.packages.length}</Badge>
                        </summary>
                        <div class="border-t border-border/60 px-3 py-3">
                            <div class="flex flex-wrap gap-1.5">
                                {#each group.packages as p (p.source + p.name + p.version)}
                                    <span
                                        class="rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground select-text"
                                    >
                                        {p.name} <span class="text-muted-foreground/60">{p.version}</span>
                                    </span>
                                {/each}
                            </div>
                            {#if group.text}
                                <pre
                                    class="mt-3 max-h-64 overflow-auto rounded bg-muted/40 p-3 text-[11px] leading-snug whitespace-pre-wrap select-text">{group.text}</pre>
                            {:else}
                                <p class="mt-3 text-xs text-muted-foreground">
                                    {t("settings.licenses.dependencies_no_file", { title: group.title })}
                                </p>
                            {/if}
                        </div>
                    </details>
                {/each}
            </div>
        {/if}
    </div>
</details>
