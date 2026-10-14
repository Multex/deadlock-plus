<script lang="ts">
    import "../app.css";
    import type { Component } from "svelte";
    import { Code } from "@lucide/svelte";
    import { page } from "$app/state";
    import DiscordIcon from "@deadlock-plus/ui/icons/discord.svelte";
    import KofiIcon from "@deadlock-plus/ui/icons/kofi.svelte";
    import { LINKS } from "$lib/content/links";
    import { currentRef, discordHref, withRef } from "$lib/content/ref";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import ThemePicker from "$lib/components/theme-picker.svelte";

    let { children } = $props();

    const ref = $derived(currentRef(page.url));

    const NAV = [
        { href: "/features", label: "Features" },
        { href: "/download", label: "Download" },
        { href: "/privacy", label: "Privacy" },
    ];

    const ICON_LINKS: { href: string; label: string; icon: Component<{ class?: string }>; tone: string }[] = $derived([
        { href: discordHref(ref), label: "Join our Discord", icon: DiscordIcon, tone: "" },
        { href: LINKS.support, label: "Support the project", icon: KofiIcon, tone: "text-kofi" },
        { href: LINKS.repo, label: "Source code on GitHub", icon: Code, tone: "" },
    ]);

    const FOOTER_GROUPS: {
        heading: string;
        links: { href: string; label: string; icon?: Component<{ class?: string }>; tone?: string; plain?: boolean }[];
    }[] = $derived([
        {
            heading: "Product",
            links: [
                { href: "/features", label: "Features" },
                { href: "/download", label: "Download" },
            ],
        },
        {
            heading: "Community",
            links: [
                { href: discordHref(ref), label: "Discord", icon: DiscordIcon, plain: true },
                { href: LINKS.repo, label: "Source code", icon: Code },
                { href: LINKS.support, label: "Support the project", icon: KofiIcon, tone: "text-kofi" },
            ],
        },
        {
            heading: "Legal",
            links: [{ href: "/privacy", label: "Privacy" }],
        },
    ]);
</script>

<div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-(--z-local) border-b border-border bg-chrome/95 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-x-2 px-4 sm:px-8">
            <a
                href={withRef("/", ref)}
                aria-label="Deadlock+ home"
                class="mr-auto flex h-10 items-center rounded-md sm:h-auto"
            >
                <BrandMark wordmark={false} class="sm:hidden" />
                <BrandMark class="hidden sm:inline-flex" />
            </a>
            <nav aria-label="Main" class="flex items-center gap-1">
                {#each NAV as item (item.href)}
                    {@const active = page.url.pathname.startsWith(item.href)}
                    <a
                        href={withRef(item.href, ref)}
                        aria-current={active ? "page" : undefined}
                        class="flex h-10 items-center rounded-md px-3 font-heading sm:h-9 text-sm font-semibold tracking-wide transition-colors {active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
                    >
                        {item.label}
                    </a>
                {/each}
            </nav>
            <div class="hidden items-center sm:flex">
                <Tooltip.Provider>
                    {#each ICON_LINKS as link (link.href)}
                        {@const Icon = link.icon}
                        <Tooltip.Root delayDuration={100}>
                            <Tooltip.Trigger>
                                {#snippet child({ props })}
                                    <a
                                        {...props}
                                        href={link.href}
                                        aria-label={link.label}
                                        class="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                                    >
                                        <Icon class="size-4.5 {link.tone}" />
                                    </a>
                                {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content side="bottom">{link.label}</Tooltip.Content>
                        </Tooltip.Root>
                    {/each}
                </Tooltip.Provider>
            </div>
        </div>
    </header>

    <main class="noir-panel flex-1">
        {@render children()}
    </main>

    <footer class="border-t border-border bg-chrome">
        <div class="mx-auto max-w-5xl px-4 py-10 text-base sm:px-8">
            <div class="flex flex-col gap-10 md:flex-row md:justify-between">
                <div class="space-y-3">
                    <a href={withRef("/", ref)} aria-label="Deadlock+ home" class="inline-flex items-center rounded-md">
                        <BrandMark />
                    </a>
                    <p class="leading-relaxed text-foreground">A free companion app for Deadlock. No account needed.</p>
                </div>
                <nav aria-label="Footer" class="flex flex-wrap gap-x-14 gap-y-8">
                    {#each FOOTER_GROUPS as group (group.heading)}
                        <div>
                            <h2 class="text-sm font-semibold tracking-widest text-brass uppercase">{group.heading}</h2>
                            <ul class="mt-3 space-y-1">
                                {#each group.links as link (link.href)}
                                    {@const Icon = link.icon}
                                    <li>
                                        <a
                                            href={link.plain ? link.href : withRef(link.href, ref)}
                                            class="-mx-2 inline-flex h-9 items-center gap-2 rounded-md px-2 whitespace-nowrap text-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass"
                                        >
                                            {#if Icon}
                                                <Icon class="size-4.5 shrink-0 {link.tone ?? ''}" />
                                            {/if}
                                            {link.label}
                                        </a>
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/each}
                </nav>
            </div>
            <div class="mt-10">
                <ThemePicker />
            </div>
            <div
                class="mt-6 flex flex-col gap-x-10 gap-y-2 border-t border-border pt-6 leading-relaxed text-muted-foreground md:flex-row md:justify-between"
            >
                <p>Licensed under GPL-3.0-or-later.</p>
                <p class="md:text-right">
                    Unofficial fan tool. Not made by, affiliated with or endorsed by Valve Corporation.
                </p>
            </div>
        </div>
    </footer>
</div>
