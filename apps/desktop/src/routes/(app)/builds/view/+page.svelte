<script lang="ts">
    import { page } from "$app/state";
    import { ArrowLeft, Info, LoaderCircle } from "@lucide/svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { BuildDetail, knownWarnings, parseTarget } from "$lib/features/builds/build-detail.svelte";
    import AbilityOrder from "$lib/features/builds/components/build-detail/ability-order.svelte";
    import DetailHeader from "$lib/features/builds/components/build-detail/detail-header.svelte";
    import ShopPanel from "$lib/features/builds/components/build-detail/shop-panel.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const target = $derived(parseTarget(page.url.searchParams));
    const detail = $derived(target ? new BuildDetail(target) : null);
    const warnings = $derived(knownWarnings(detail?.local?.warnings ?? []));

    $effect(() => {
        void detail?.load();
    });
</script>

<Page class="max-w-[1232px] px-4">
    <a href="/builds" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft class="size-4" aria-hidden="true" />
        {t("builds.view.back")}
    </a>

    {#if !detail}
        <EmptyState size="base" spacing="xl" data-testid="build-empty">{t("builds.view.empty")}</EmptyState>
    {:else if detail.status === "loading"}
        <EmptyState size="base" spacing="xl" aria-busy="true">
            <LoaderCircle class="mx-auto size-5 animate-spin" aria-label={t("builds.view.loading")} />
        </EmptyState>
    {:else if detail.status === "failed"}
        <EmptyState size="base" spacing="xl" tone="destructive" role="alert">{detail.error}</EmptyState>
    {:else if detail.status === "missing"}
        <EmptyState size="base" spacing="xl" role="alert" data-testid="build-missing">
            {t("builds.view.missing")}
        </EmptyState>
    {:else if detail.build}
        <DetailHeader {detail} ownAccountId={steamAccount.account?.steamId32 ?? null} />

        {#if warnings.length > 0}
            <div
                class="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                role="note"
                data-testid="build-warnings"
            >
                <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <ul class="space-y-0.5">
                    {#each warnings as code (code)}
                        <li>{t(`builds.view.warning_${code}`)}</li>
                    {/each}
                </ul>
            </div>
        {/if}

        <ShopPanel
            build={detail.build}
            catalog={detail.catalog}
            catalogFailed={detail.catalogFailed}
            kit={detail.kit}
        />
        <AbilityOrder
            order={detail.build.abilityOrder}
            kit={detail.kit}
            build={detail.build}
            catalog={detail.catalog}
        />
    {/if}
</Page>
