<script lang="ts">
    import { Heart } from "@lucide/svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import type { BuildDetail } from "../../build-detail.svelte";
    import StatusBadge from "../my-builds/status-badge.svelte";
    import DetailActions from "./detail-actions.svelte";

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

        <DetailActions {detail} {ownAccountId} />
    </div>
</Card>
