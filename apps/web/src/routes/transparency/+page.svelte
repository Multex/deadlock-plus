<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { LINKS } from "$lib/content/links";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import KofiIcon from "@deadlock-plus/ui/icons/kofi.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
    import type { Stat } from "$lib/server/transparency/stats";

    let { data } = $props();

    // UTC, so the server and the browser print the same time.
    const dayFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
    const timeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
    const countFormat = new Intl.NumberFormat("en-US");

    const tiles = $derived(
        [
            { label: "Installs", stat: data.stats.installs, app: true },
            { label: "Monthly active users", stat: data.stats.monthlyActive, app: true },
            { label: "Downloads", stat: data.stats.downloads, app: false },
            { label: "Discord members", stat: data.stats.discordMembers, app: false },
        ].filter((tile): tile is { label: string; stat: Stat; app: boolean } => tile.stat !== undefined),
    );
    const oldest = $derived(tiles.map((tile) => tile.stat.at).sort()[0]);

    const money = $derived(
        new Intl.NumberFormat("en-US", { style: "currency", currency: data.costs?.currency ?? "USD" }),
    );
    const PERIOD = { month: "/ month", year: "/ year", once: "once" } as const;

    const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00.000Z`));
</script>

<Seo
    title="Transparency | Deadlock+"
    description="What Deadlock+ costs to run, and how many people use it. Updated every hour."
/>

<Page>
    <PageHeader title="Transparency" subtitle="What Deadlock+ costs to run, and how many people use it." />

    <Section title="By the numbers" padding="lg">
        {#if tiles.length > 0}
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
                {#each tiles as tile (tile.label)}
                    <Card padding="md" class="bg-background/40">
                        <p class="font-heading text-3xl tabular-nums">
                            {countFormat.format(tile.stat.value)}{#if tile.app}<span
                                    class="text-brass"
                                    aria-hidden="true">*</span
                                >{/if}
                        </p>
                        <p class="mt-1 text-sm text-muted-foreground">{tile.label}</p>
                    </Card>
                {/each}
            </div>
            <ul class="mt-3 space-y-1 text-xs text-muted-foreground">
                {#if tiles.some((tile) => tile.app)}
                    <li>
                        <span class="text-brass" aria-hidden="true">*</span>
                        Only counts installs with "Share anonymous usage data" turned on.
                    </li>
                {/if}
                <li>Downloads are installers fetched from GitHub, updates included.</li>
                {#if oldest}
                    <li>Updated every hour. Last update {timeFormat.format(new Date(oldest))} UTC.</li>
                {/if}
            </ul>
        {:else}
            <EmptyState>The numbers appear after the first hourly update.</EmptyState>
        {/if}
    </Section>

    <Section title="Where the money goes" padding="lg">
        {#if data.costs && data.costs.items.length > 0}
            <div class="grid grid-cols-2 gap-3">
                <Card padding="md" class="bg-background/40">
                    <p class="font-heading text-3xl tabular-nums">{money.format(data.costs.monthly)}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Per month</p>
                </Card>
                <Card padding="md" class="bg-background/40">
                    <p class="font-heading text-3xl tabular-nums">{money.format(data.costs.spent)}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Spent so far</p>
                </Card>
            </div>

            <ul class="mt-4 divide-y divide-border">
                {#each data.costs.items as item (item.name + item.since)}
                    <li class="flex items-start justify-between gap-4 py-3" class:opacity-60={item.ended}>
                        <div class="min-w-0">
                            <p class="font-medium">{item.name}</p>
                            <p class="text-sm text-muted-foreground">{item.purpose}</p>
                            {#if item.ended && item.until}
                                <p class="text-xs text-muted-foreground">Ended {formatDay(item.until)}</p>
                            {/if}
                        </div>
                        <p class="shrink-0 text-right tabular-nums">
                            {money.format(item.amount)}
                            <span class="block text-xs text-muted-foreground">{PERIOD[item.period]}</span>
                        </p>
                    </li>
                {/each}
            </ul>
        {:else}
            <EmptyState>The cost list is not published yet.</EmptyState>
        {/if}

        <div class="mt-4 border-t border-border pt-4">
            <a href={LINKS.support} class={buttonVariants({ variant: "outline", size: "sm" })}>
                <KofiIcon class="text-kofi" />
                Help cover the costs
            </a>
        </div>
    </Section>
</Page>
