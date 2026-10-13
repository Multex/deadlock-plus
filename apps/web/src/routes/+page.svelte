<script lang="ts">
    import { ArrowRight, Download } from "@lucide/svelte";
    import DiscordIcon from "@deadlock-plus/ui/icons/discord.svelte";
    import Shot from "$lib/components/shot.svelte";
    import { HERO_DETAIL_SHOT, HERO_SHOT, highlights } from "$lib/content/features";
    import { LINKS } from "$lib/content/links";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";

    const trust = [
        {
            title: "Free, no account",
            body: "Deadlock+ is free. There is nothing to sign up for.",
        },
        {
            title: "Stays on your PC",
            body: "Everything runs on your PC. The few things the app sends out are listed on the privacy page.",
        },
        {
            title: "Nothing hidden",
            body: "The app's code is public. Anyone can read it and see exactly what it does.",
        },
    ];
</script>

<svelte:head>
    <title>Deadlock+ | Companion app for Deadlock</title>
    <meta
        name="description"
        content="Deadlock+ is a free companion app for Deadlock. Show your match on Discord, pick your servers, and see your match history, rank and stats. No account needed."
    />
</svelte:head>

<Page>
    <header class="py-12 sm:py-20">
        <h1 class="max-w-3xl text-5xl leading-tight sm:text-6xl">
            Your new favorite companion for <span class="text-brass">Deadlock</span>
        </h1>
        <p class="mt-4 max-w-2xl text-lg text-muted-foreground">
            Show friends what you are playing on Discord, pick which servers you play on, follow your match as it
            happens, look back at your matches and rank, and tidy up mutes, replays and disk space. One app, no account.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
            <a href="/download" class={buttonVariants({ size: "lg" })}>
                <Download />
                Download for Windows
            </a>
            <a href={LINKS.discord} class={buttonVariants({ variant: "outline", size: "lg" })}>
                <DiscordIcon class="size-4" />
                Join our Discord
            </a>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">
            Windows 10 and 11. <a href="/download#linux" class="underline hover:text-foreground">Linux</a> may not work on
            every setup.
        </p>
    </header>

    <Shot
        name={HERO_SHOT}
        detail={HERO_DETAIL_SHOT}
        label="A match page in Deadlock+"
        eager
        class="shadow-2xl shadow-black/60"
    />

    <section>
        <div class="mb-3 flex items-end justify-between gap-3">
            <h2 class="text-2xl">What it does</h2>
            <a href="/features" class={buttonVariants({ variant: "ghost", size: "sm" })}>
                Every feature
                <ArrowRight />
            </a>
        </div>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each highlights() as feature (feature.id)}
                <li>
                    <Card
                        padding="none"
                        class="flex h-full flex-col overflow-hidden transition-colors hover:border-brass/50 hover:bg-accent/40"
                    >
                        {#if feature.shot}
                            <Shot
                                name={feature.shot}
                                detail={feature.detailShot}
                                label="{feature.name} in Deadlock+"
                                framed={false}
                            />
                        {/if}
                        <a href="/features#{feature.id}" class="block flex-1 border-t border-border p-4">
                            <h3 class="text-base font-semibold text-brass">{feature.name}</h3>
                            <p class="mt-1 text-sm text-muted-foreground">{feature.summary}</p>
                        </a>
                    </Card>
                </li>
            {/each}
        </ul>
    </section>

    <Section title="Is it safe? Check it yourself." titleClass="mb-4">
        <ul class="grid gap-5 md:grid-cols-3">
            {#each trust as item (item.title)}
                <li class="border-l-2 border-brass pl-4">
                    <h3 class="font-semibold">{item.title}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </li>
            {/each}
        </ul>
        <div class="mt-5 flex flex-wrap gap-2">
            <a href={LINKS.repo} class={buttonVariants({ variant: "outline", size: "sm" })}>Read the code</a>
            <a href="/privacy" class={buttonVariants({ variant: "outline", size: "sm" })}>Privacy</a>
        </div>
    </Section>

    <Section class="flex flex-wrap items-center justify-between gap-4" padding="lg">
        <div>
            <h2 class="text-xl">Ready when you are</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Deadlock+ is free. Updates install only when you click, and each one is checked before it runs.
            </p>
        </div>
        <a href="/download" class={buttonVariants()}>
            <Download />
            Download
        </a>
    </Section>
</Page>
