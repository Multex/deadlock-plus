<script lang="ts">
    import { Check, Clock, Copy, Heart, LoaderCircle, Star, Trash2, TriangleAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { goto } from "$app/navigation";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { failureText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import type { BuildDetail } from "../../build-detail.svelte";
    import StatusBadge from "../my-builds/status-badge.svelte";

    let { detail, ownAccountId }: { detail: BuildDetail; ownAccountId: number | null } = $props();

    const build = $derived(detail.build!);
    const hero = $derived(detail.hero);
    let portraitFailed = $state(false);
    const art = $derived(portraitFailed ? (hero?.icon ?? null) : (hero?.portrait ?? hero?.icon ?? null));

    const author = $derived(
        build.authorAccountId === ownAccountId
            ? t("builds.view.by_you")
            : detail.author
              ? t("builds.browser.by", { name: detail.author })
              : null,
    );
    const updated = $derived(
        build.lastUpdatedTimestamp
            ? t("builds.browser.updated", {
                  date: formatDate(build.lastUpdatedTimestamp * 1000, { dateStyle: "medium" }),
              })
            : null,
    );
    const copy = $derived(detail.copy);
    const favourite = $derived(detail.favourite);
    let discarding = $state(false);

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

<Card padding="none" class="overflow-hidden" data-testid="build-header">
    <div class="flex items-stretch gap-5 p-5">
        <div class="h-28 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {#if art}
                <img
                    src={art}
                    alt={hero?.name ?? ""}
                    class="size-full object-cover object-top"
                    onerror={() => (portraitFailed = true)}
                />
            {/if}
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                <h1 class="min-w-0 truncate text-3xl">{build.name}</h1>
                {#if detail.badge}
                    <span class="contents" data-status={detail.badge}>
                        <StatusBadge status={detail.badge} />
                    </span>
                {/if}
            </div>
            {#if build.description.trim()}
                <p class="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{build.description}</p>
            {/if}
            <p class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {#if hero}
                    <span class="font-medium text-foreground">{hero.name}</span>
                {/if}
                {#if author}
                    <span>{author}</span>
                {/if}
                {#if updated}
                    <span>{updated}</span>
                {/if}
                {#if detail.favourites !== null}
                    <span
                        class="inline-flex items-center gap-1"
                        data-testid="favourites"
                        data-count={detail.favourites}
                    >
                        <Heart class="size-3.5" aria-hidden="true" />
                        {tn("builds.browser.favorites", detail.favourites)}
                    </span>
                {:else if build.favorited}
                    <span class="inline-flex items-center gap-1">
                        <Heart class="size-3.5 fill-current text-brass" aria-hidden="true" />
                        {t("builds.view.favourited")}
                    </span>
                {/if}
            </p>
        </div>

        <div class="flex w-56 shrink-0 flex-col items-end gap-2 border-l border-border pl-5">
            <Button
                class="w-full"
                variant="outline"
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
            {#if copy.kind === "written"}
                <p class="text-right text-xs text-muted-foreground" role="status">
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
                <p class="text-right text-xs text-muted-foreground" role="status">
                    <Clock class="mr-0.5 inline size-3.5 text-warning" aria-hidden="true" />
                    {t("builds.mine.queued")}
                </p>
            {:else if copy.kind === "conflict"}
                <p class="text-right text-xs text-warning" role="status">
                    <TriangleAlert class="mr-0.5 inline size-3.5" aria-hidden="true" />
                    {t("builds.mine.changed_in_game")}
                </p>
            {:else if copy.kind === "failed"}
                <p class="text-right text-xs text-destructive" role="alert">{copy.message}</p>
            {/if}
            {#if detail.canFavourite}
                <Button
                    class="w-full"
                    variant="toggle"
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
                {#if favourite.kind === "queued"}
                    <p class="text-right text-xs text-muted-foreground" role="status">
                        <Clock class="mr-0.5 inline size-3.5 text-warning" aria-hidden="true" />
                        {t("builds.mine.queued")}
                    </p>
                {:else if favourite.kind === "conflict"}
                    <p class="text-right text-xs text-warning" role="status">
                        <TriangleAlert class="mr-0.5 inline size-3.5" aria-hidden="true" />
                        {t("builds.mine.changed_in_game")}
                    </p>
                {:else if favourite.kind === "failed"}
                    <p class="text-right text-xs text-destructive" role="alert">{favourite.message}</p>
                {/if}
            {/if}
            {#if detail.draft}
                <Button
                    class="w-full text-destructive hover:text-destructive"
                    variant="ghost"
                    disabled={discarding}
                    data-testid="discard-draft"
                    onclick={() => void discard()}
                >
                    <Trash2 aria-hidden="true" />
                    {t("builds.mine.discard_draft")}
                </Button>
            {/if}
        </div>
    </div>
</Card>
