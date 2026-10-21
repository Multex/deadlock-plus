<script lang="ts">
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { conflictSides, type ConflictSide } from "$lib/features/builds/my-builds";
    import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
    import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";

    let {
        conflict,
        busy,
        onresolve,
    }: {
        conflict: ConflictView | null;
        busy: boolean;
        onresolve: (choice: ResolveChoice) => void;
    } = $props();

    let open = $state(false);
    $effect(() => {
        open = conflict !== null;
    });

    const sides = $derived(conflict ? conflictSides(conflict) : null);

    const when = (side: ConflictSide) =>
        side.deleted
            ? t("builds.mine.conflict.deleted")
            : side.updatedAt === null
              ? null
              : formatDate(side.updatedAt * 1000, { dateStyle: "medium", timeStyle: "short" });
</script>

{#snippet version(label: string, side: ConflictSide)}
    <div class="min-w-0 flex-1 rounded-md border border-border px-3 py-2">
        <p class="text-xs text-muted-foreground">{label}</p>
        <p class="truncate text-sm font-medium">{side.name}</p>
        {#if when(side)}
            <p class="text-xs text-muted-foreground">{when(side)}</p>
        {/if}
    </div>
{/snippet}

<!-- Closing without a choice keeps the save queued; the dialog comes back with the next flush. -->
<Dialog.Root bind:open>
    <Dialog.Content class="max-w-md">
        <Dialog.Title>{t("builds.mine.conflict.title")}</Dialog.Title>
        {#if sides}
            <Dialog.Description class="text-sm text-muted-foreground">
                {t("builds.mine.conflict.description", { name: sides.ours.name })}
            </Dialog.Description>
            <div class="flex gap-3">
                {@render version(t("builds.mine.conflict.mine"), sides.ours)}
                {@render version(t("builds.mine.conflict.game"), sides.game)}
            </div>
        {/if}
        <div class="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onclick={() => onresolve("game")}>
                {t("builds.mine.conflict.keep_game")}
            </Button>
            <Button disabled={busy} onclick={() => onresolve("ours")}>
                {t("builds.mine.conflict.keep_mine")}
            </Button>
        </div>
    </Dialog.Content>
</Dialog.Root>
