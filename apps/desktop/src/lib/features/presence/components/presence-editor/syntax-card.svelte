<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Copy } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { presencePreview } from "$lib/features/presence/api";
    import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
    import { SYNTAX_EXAMPLES, groupPlaceholders, renderTemplate } from "./editor";
    import { PLACEHOLDER_GROUP_LABELS, PLACEHOLDER_HELP, SYNTAX_LABELS } from "./labels";

    let {
        placeholders,
        status = "ready",
        onretry,
    }: {
        placeholders: PresencePlaceholder[];
        status?: "loading" | "ready" | "error";
        onretry?: () => void;
    } = $props();

    let rendered = $state<Record<string, string>>({});
    let samples = $state<Record<string, string>>({});
    const groups = $derived(groupPlaceholders(placeholders));

    onMount(() => {
        for (const e of SYNTAX_EXAMPLES) {
            void renderTemplate(presencePreview, e.source).then((text) => (rendered[e.id] = text));
        }
    });

    $effect(() => {
        for (const p of placeholders) {
            void renderTemplate(presencePreview, `{${p.name}}`).then((text) => (samples[p.name] = text));
        }
    });

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t("settings.discord_editor.syntax.copied"));
        } catch {
            toast.error(t("settings.discord_editor.export_failed"));
        }
    }

    const example = (id: string) => SYNTAX_EXAMPLES.find((e) => e.id === id)!.source;

    const STEPS = [
        { title: "step1_title", body: "step1_body", ids: ["placeholder"] },
        { title: "step2_title", body: "step2_body", ids: ["empty"] },
        { title: "step3_title", body: "step3_body", ids: ["group_shown", "group_dropped"] },
        { title: "step4_title", body: "step4_body", ids: ["fallback", "chain"] },
    ] as const;
</script>

{#snippet demo(id: string)}
    {@const source = example(id)}
    <div class="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
        <button
            type="button"
            class="flex items-center justify-between gap-2 rounded-md border bg-muted px-2 py-1.5 text-left font-mono text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={t("settings.discord_editor.syntax.copy_example", { text: source })}
            onclick={() => copy(source)}
        >
            <span class="break-all">{source}</span>
            <Copy class="size-3.5 shrink-0" aria-hidden="true" />
        </button>
        <span class="hidden text-muted-foreground sm:inline" aria-hidden="true">&rarr;</span>
        <p class="text-sm">
            <span class="mr-1 text-xs text-muted-foreground sm:hidden">
                {t("settings.discord_editor.syntax.you_see")}
            </span>
            {#if rendered[id] === undefined}
                <span class="text-muted-foreground">...</span>
            {:else if rendered[id] === ""}
                <span class="text-muted-foreground">{t("settings.discord_editor.syntax.nothing")}</span>
            {:else}
                <span class="font-medium">{rendered[id]}</span>
            {/if}
        </p>
    </div>
{/snippet}

<div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
        <h4 class="font-heading text-sm font-semibold">{t("settings.discord_editor.syntax.title")}</h4>
        <p class="text-sm text-muted-foreground">{t("settings.discord_editor.syntax.intro")}</p>
    </div>

    {#each STEPS as step, i (step.title)}
        <section class="flex flex-col gap-2 rounded-md border p-3">
            <h5 class="flex items-center gap-2 text-sm font-semibold">
                <span
                    class="flex size-5 shrink-0 items-center justify-center rounded-full bg-brass/20 text-xs text-brass"
                    aria-hidden="true"
                >
                    {i + 1}
                </span>
                {t(`settings.discord_editor.syntax.${step.title}`)}
            </h5>
            <p class="text-sm text-muted-foreground">{t(`settings.discord_editor.syntax.${step.body}`)}</p>
            {#each step.ids as id (id)}
                {@render demo(id)}
            {/each}
        </section>
    {/each}

    <section class="flex flex-col gap-2">
        <h5 class="text-sm font-semibold">{t("settings.discord_editor.syntax.list_title")}</h5>
        <p class="text-sm text-muted-foreground">{t("settings.discord_editor.syntax.list_body")}</p>
        {#if status === "error"}
            <RegionError
                name="presence-syntax"
                size="sm"
                title={t("region.error_title")}
                body={t("region.error_body")}
                retryLabel={t("region.retry")}
                {onretry}
            />
        {:else if status === "loading"}
            <p class="text-sm text-muted-foreground">{t("settings.discord_editor.loading")}</p>
        {/if}
        {#each status === "ready" ? groups : [] as group (group.id)}
            <div class="overflow-hidden rounded-md border">
                <h6 class="bg-muted px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">
                    {PLACEHOLDER_GROUP_LABELS[group.id]()}
                </h6>
                <table class="w-full text-left text-sm">
                    <thead class="text-xs text-muted-foreground">
                        <tr class="border-b">
                            <th scope="col" class="px-3 py-1.5 font-medium">
                                {t("settings.discord_editor.syntax.col_variable")}
                            </th>
                            <th scope="col" class="px-3 py-1.5 font-medium">
                                {t("settings.discord_editor.syntax.col_shows")}
                            </th>
                            <th scope="col" class="px-3 py-1.5 font-medium">
                                {t("settings.discord_editor.syntax.col_example")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each group.items as p (p.name)}
                            <tr class="border-b last:border-b-0">
                                <td class="px-3 py-1.5 align-top">
                                    <code class="font-mono text-xs">{`{${p.name}}`}</code>
                                    {#if p.sensitive}
                                        <Badge variant="warning" class="ml-1">
                                            {t("settings.discord_editor.sensitive")}
                                        </Badge>
                                    {/if}
                                </td>
                                <td class="px-3 py-1.5 align-top text-muted-foreground">
                                    {PLACEHOLDER_HELP[p.name]?.() ?? ""}
                                </td>
                                <td class="px-3 py-1.5 align-top">
                                    {#if samples[p.name]}
                                        {samples[p.name]}
                                    {:else}
                                        <span class="text-muted-foreground">
                                            {t("settings.discord_editor.syntax.no_sample")}
                                        </span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/each}
    </section>

    <section class="flex flex-col gap-1.5">
        <h5 class="text-sm font-semibold">{t("settings.discord_editor.syntax.rules_title")}</h5>
        <ul class="list-disc pl-5 text-sm text-muted-foreground">
            {#each SYNTAX_LABELS.rules as rule (rule)}
                <li>{rule()}</li>
            {/each}
        </ul>
    </section>

    <p class="text-sm text-muted-foreground">{t("settings.discord_editor.syntax.privacy")}</p>
</div>
