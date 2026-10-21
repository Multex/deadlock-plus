<script lang="ts">
    import { TriangleAlert, Wrench } from "@lucide/svelte";
    import { badgeVariants } from "@deadlock-plus/ui/badge.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import { layoutIssues, repairLayout } from "../../editor/repair";

    let { editor }: { editor: BuildEditor } = $props();

    let open = $state(false);

    const issues = $derived(layoutIssues(editor.build));
    const count = $derived(issues.reduce((sum, issue) => sum + issue.kinds.length, 0));

    function name(index: number): string {
        return editor.build.modCategories[index]?.name || t("builds.view.category_fallback", { n: index + 1 });
    }

    function reveal(index: number) {
        editor.select([], "replace");
        editor.activeCategory = index;
        document
            .querySelector(`[role="application"] [data-category="${index}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function fixAll() {
        editor.apply(repairLayout(editor.build), "repair");
    }
</script>

{#if count > 0}
    <DropdownMenu.Root bind:open>
        <DropdownMenu.Trigger
            class={cn(badgeVariants({ variant: "warning" }), "h-7 cursor-pointer gap-1.5 px-2.5 hover:bg-warning/25")}
            data-testid="layout-issues"
            data-count={count}
        >
            <TriangleAlert aria-hidden="true" />
            {tn("builds.editor.layout.issues", count)}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="w-80" align="end" data-testid="layout-issues-list">
            <DropdownMenu.Group>
                <DropdownMenu.GroupHeading class="leading-snug">
                    {t("builds.editor.layout.heading")}
                </DropdownMenu.GroupHeading>
                {#each issues as issue (issue.index)}
                    <DropdownMenu.Item
                        class="flex-col items-start gap-0.5"
                        data-testid="layout-issue"
                        onSelect={() => reveal(issue.index)}
                    >
                        <span class="w-full truncate font-medium">{name(issue.index)}</span>
                        {#each issue.kinds as kind (kind)}
                            <span class="text-xs text-warning">{t(`builds.editor.layout.kind_${kind}`)}</span>
                        {/each}
                    </DropdownMenu.Item>
                {/each}
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Item class="font-medium" data-testid="layout-fix-all" onSelect={fixAll}>
                <Wrench aria-hidden="true" />
                <span class="flex flex-col">
                    {t("builds.editor.layout.fix_all")}
                    <span class="text-xs font-normal text-muted-foreground">{t("builds.editor.layout.fix_hint")}</span>
                </span>
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/if}
