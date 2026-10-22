<script lang="ts">
    import type { Snippet } from "svelte";
    import { Check, Clock, Copy, LoaderCircle, Pencil, Star, Trash2, TriangleAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { goto } from "$app/navigation";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { detailExportRequest } from "../../build-code.svelte";
    import type { BuildDetail } from "../../build-detail.svelte";
    import CopyForGame from "../build-code/copy-for-game.svelte";
    import { editHref, editsInPlace } from "../../editor/load";

    let {
        detail,
        ownAccountId,
        layout = "column",
        leading,
    }: {
        detail: BuildDetail;
        ownAccountId: number | null;
        /** A column of full-width buttons beside the view page's header, or one row of small ones. */
        layout?: "column" | "row";
        leading?: Snippet;
    } = $props();

    const build = $derived(detail.build!);
    const copy = $derived(detail.copy);
    const favourite = $derived(detail.favourite);
    const column = $derived(layout === "column");
    const size = $derived(column ? "default" : "sm");
    const width = $derived(column ? "w-full" : "");
    const note = $derived(column ? "text-right text-xs" : "text-xs");
    let discarding = $state(false);
    let discardOpen = $state(false);

    const edit = $derived.by(() => {
        const draft = detail.draft;
        if (draft) return { href: editHref({ source: "draft", id: draft.id }), own: true };
        const own = detail.local
            ? editsInPlace(detail.local, ownAccountId)
            : ownAccountId !== null && build.authorAccountId === ownAccountId;
        return { href: editHref(detail.target), own };
    });

    async function discard() {
        discarding = true;
        try {
            await detail.discardDraft();
            toast.success(t("builds.mine.draft_discarded"));
            await goto("/builds");
        } catch (e) {
            toast.error(failureText(e, t("builds.mine.action_failed")));
        } finally {
            discarding = false;
        }
    }
</script>

{#snippet copyStatus()}
    {#if copy.kind === "written"}
        <p class={cn(note, "text-muted-foreground")} role="status">
            <Check class="mr-0.5 inline size-3.5 text-success" aria-hidden="true" />
            {t("builds.mine.copied")}
            <a
                class="text-primary underline-offset-4 hover:underline"
                href="/builds/view?source=local&id={copy.buildId}"
            >
                {t("builds.view.open_copy")}
            </a>
        </p>
    {:else if copy.kind === "queued"}
        <p class={cn(note, "text-muted-foreground")} role="status">
            <Clock class="mr-0.5 inline size-3.5 text-warning" aria-hidden="true" />
            {t("builds.mine.queued")}
        </p>
    {:else if copy.kind === "conflict"}
        <p class={cn(note, "text-warning")} role="status">
            <TriangleAlert class="mr-0.5 inline size-3.5" aria-hidden="true" />
            {t("builds.mine.changed_in_game")}
        </p>
    {:else if copy.kind === "failed"}
        <p class={cn(note, "text-destructive")} role="alert">{copy.message}</p>
    {/if}
{/snippet}

{#snippet favouriteStatus()}
    {#if favourite.kind === "queued"}
        <p class={cn(note, "text-muted-foreground")} role="status">
            <Clock class="mr-0.5 inline size-3.5 text-warning" aria-hidden="true" />
            {t("builds.mine.queued")}
        </p>
    {:else if favourite.kind === "conflict"}
        <p class={cn(note, "text-warning")} role="status">
            <TriangleAlert class="mr-0.5 inline size-3.5" aria-hidden="true" />
            {t("builds.mine.changed_in_game")}
        </p>
    {:else if favourite.kind === "failed"}
        <p class={cn(note, "text-destructive")} role="alert">{favourite.message}</p>
    {/if}
{/snippet}

{#snippet editButton()}
    <a class={buttonVariants({ variant: "outline", size, class: width })} href={edit.href} data-testid="edit-build">
        <Pencil aria-hidden="true" />
        {edit.own ? t("builds.editor.edit") : t("builds.editor.edit_copy")}
    </a>
{/snippet}

{#snippet copyButton()}
    <Button
        class={width}
        variant="outline"
        {size}
        disabled={copy.kind === "saving"}
        data-testid="copy-as-new"
        onclick={() => void detail.copyAsNew()}
    >
        {#if copy.kind === "saving"}
            <LoaderCircle class="animate-spin" aria-hidden="true" />
        {:else}
            <Copy aria-hidden="true" />
        {/if}
        {t("builds.mine.copy")}
    </Button>
{/snippet}

{#snippet gameCodeButton()}
    <CopyForGame
        class={width}
        {size}
        request={() => detailExportRequest(build, detail.local, detail.draft)}
        heroId={build.heroId}
    />
{/snippet}

{#snippet favouriteButton()}
    <Button
        class={width}
        variant="toggle"
        {size}
        aria-pressed={detail.favourited}
        disabled={favourite.kind === "saving"}
        data-testid="favourite"
        onclick={() => void detail.toggleFavourite()}
    >
        {#if favourite.kind === "saving"}
            <LoaderCircle class="animate-spin" aria-hidden="true" />
        {:else}
            <Star class={detail.favourited ? "fill-current" : ""} aria-hidden="true" />
        {/if}
        {t("builds.mine.favourite")}
    </Button>
{/snippet}

{#snippet discardButton()}
    <Button
        class={cn(width, "text-destructive hover:text-destructive")}
        variant="ghost"
        {size}
        disabled={discarding}
        data-testid="discard-draft"
        onclick={() => (discardOpen = true)}
    >
        <Trash2 aria-hidden="true" />
        {t("builds.mine.discard_draft")}
    </Button>
{/snippet}

{#if column}
    <div class="flex w-56 shrink-0 flex-col items-end gap-2 border-l border-border pl-5">
        {@render leading?.()}
        {@render editButton()}
        {@render copyButton()}
        {@render copyStatus()}
        {@render gameCodeButton()}
        {#if detail.canFavourite}
            {@render favouriteButton()}
            {@render favouriteStatus()}
        {/if}
        {#if detail.draft}{@render discardButton()}{/if}
    </div>
{:else}
    <div class="flex flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
            {@render leading?.()}
            {@render editButton()}
            {@render copyButton()}
            {@render gameCodeButton()}
            {#if detail.canFavourite}{@render favouriteButton()}{/if}
            {#if detail.draft}{@render discardButton()}{/if}
        </div>
        {@render copyStatus()}
        {#if detail.canFavourite}{@render favouriteStatus()}{/if}
    </div>
{/if}

<ConfirmDialog
    bind:open={discardOpen}
    class="max-w-md"
    title={t("builds.mine.discard_title", { name: build.name })}
    description={t("builds.mine.discard_description")}
    confirmLabel={t("builds.mine.discard_draft")}
    destructive
    disabled={discarding}
    onconfirm={discard}
/>
