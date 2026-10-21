<script lang="ts">
    import { onMount } from "svelte";
    import { ArrowDownWideNarrow } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { BuildBrowser } from "../../browser.svelte";
    import type { PublicSort } from "../../public-builds";
    import BuildCard from "./build-card.svelte";

    let { hero = null }: { hero?: number | null } = $props();

    const browser = new BuildBrowser();

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const heroItems = $derived(browser.heroes.map((h) => ({ value: String(h.id), label: h.name, icon: h.icon })));
    const heroName = $derived(browser.heroes.find((h) => h.id === browser.heroId)?.name ?? "");
    const sorts = $derived<{ value: PublicSort; label: string }[]>([
        { value: "weekly", label: t("builds.browser.sort_weekly") },
        { value: "all_time", label: t("builds.browser.sort_all_time") },
        { value: "newest", label: t("builds.browser.sort_newest") },
    ]);

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });

    $effect(() => {
        browser.requested = hero;
        browser.picked = null;
    });

    $effect(() => browser.debounceSearch());

    $effect(() => {
        if (browser.request) void browser.load(browser.request);
    });

    onMount(() => browser.start());
</script>

<div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
        <SelectMenu
            items={heroItems}
            value={browser.heroId === null ? undefined : String(browser.heroId)}
            onValueChange={(v) => (browser.picked = Number(v))}
            placeholder={t("builds.browser.hero")}
            aria-label={t("builds.browser.hero")}
            class="w-52"
        >
            {#snippet leading(item)}
                {#if item.icon}<img src={item.icon} alt="" />{/if}
            {/snippet}
        </SelectMenu>
        <Segmented
            options={sorts}
            value={browser.sort}
            label={t("builds.browser.sort")}
            icon={ArrowDownWideNarrow}
            onselect={(v) => (browser.sort = v)}
        />
        <Input
            bind:value={browser.search}
            type="search"
            placeholder={t("builds.browser.search")}
            aria-label={t("builds.browser.search_label")}
            class="min-w-48 flex-1"
        />
    </div>

    <div aria-busy={browser.status === "loading"}>
        {#if browser.status === "loading"}
            <EmptyState role="status">{t("builds.browser.loading")}</EmptyState>
        {:else if browser.status === "error"}
            <EmptyState role="status" tone="destructive">
                {browser.error}
                {#snippet action()}
                    <Button variant="outline" size="sm" onclick={() => browser.retry()}>
                        {t("builds.browser.retry")}
                    </Button>
                {/snippet}
            </EmptyState>
        {:else if browser.builds.length === 0}
            <EmptyState role="status">
                {browser.request?.search
                    ? t("builds.browser.empty_search", { query: browser.request.search.trim() })
                    : t("builds.browser.empty", { hero: heroName })}
            </EmptyState>
        {:else}
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-3">
                {#each browser.builds as entry (entry.build.heroBuildId)}
                    <li>
                        <BuildCard
                            {entry}
                            author={browser.authors.get(entry.build.authorAccountId)}
                            resolve={browser.resolve}
                            weekly={browser.sort === "weekly"}
                        />
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>
