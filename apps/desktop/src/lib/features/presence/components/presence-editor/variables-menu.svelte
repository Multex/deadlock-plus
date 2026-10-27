<script lang="ts">
    import { Braces, CircleHelp } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { t } from "$lib/core/i18n.svelte";
    import { smoothScroll } from "$lib/core/reduced-motion";
    import { PLACEHOLDER_HELP } from "./labels";
    import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";

    let {
        placeholders,
        target,
        insert,
    }: {
        placeholders: PresencePlaceholder[];
        target: string;
        insert: (name: string) => void;
    } = $props();

    function showSyntax() {
        document.getElementById("pe-syntax")?.scrollIntoView({ behavior: smoothScroll(), block: "start" });
    }
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" type="button">
                <Braces aria-hidden="true" />
                {t("settings.discord_editor.insert_variable")}
            </Button>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="max-h-80 w-80 overflow-y-auto">
        <p class="px-2 py-1 text-xs text-muted-foreground">
            {t("settings.discord_editor.insert_into", { field: target })}
        </p>
        {#each placeholders as p (p.name)}
            <DropdownMenu.Item onSelect={() => insert(p.name)}>
                <span class="flex min-w-0 flex-1 flex-col">
                    <span class="flex items-center gap-2">
                        <code class="font-mono text-xs">{`{${p.name}}`}</code>
                        {#if p.sensitive}
                            <Badge variant="warning">{t("settings.discord_editor.sensitive")}</Badge>
                        {/if}
                    </span>
                    <span class="text-xs text-muted-foreground">
                        {PLACEHOLDER_HELP[p.name]?.() ?? ""}
                    </span>
                </span>
            </DropdownMenu.Item>
        {/each}
        <DropdownMenu.Item onSelect={showSyntax}>
            <CircleHelp aria-hidden="true" />
            {t("settings.discord_editor.syntax_help")}
        </DropdownMenu.Item>
    </DropdownMenu.Content>
</DropdownMenu.Root>
