<script lang="ts">
    import "../app.css";
    import type { Component } from "svelte";
    import { Code, Eye } from "@lucide/svelte";
    import { page } from "$app/state";
    import DiscordIcon from "@deadlock-plus/ui/icons/discord.svelte";
    import KofiIcon from "@deadlock-plus/ui/icons/kofi.svelte";
    import { LINKS } from "$lib/content/links";
    import { currentRef, discordHref, withRef } from "$lib/content/ref";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import LanguageBanner from "$lib/components/language-banner.svelte";
    import LanguagePicker from "$lib/components/language-picker.svelte";
    import ThemePicker from "$lib/components/theme-picker.svelte";
    import { provideI18n, useI18n } from "$lib/i18n";
    import { localizedHref } from "$lib/i18n/routes";

    let { children, data } = $props();

    const context = $derived({ locale: data.locale, catalogs: data.catalogs });
    provideI18n(() => context);
    const i18n = useI18n();
    const { t } = i18n;

    const local = (href: string) => localizedHref(withRef(href, ref), i18n.locale);

    const ref = $derived(currentRef(page.url));

    const NAV = [
        { href: "/features", label: t("nav.features") },
        { href: "/download", label: t("nav.download") },
        { href: "/privacy", label: t("nav.privacy") },
    ];

    const ICON_LINKS: { href: string; label: string; icon: Component<{ class?: string }>; tone: string }[] = $derived([
        { href: discordHref(ref), label: t("nav.join_discord"), icon: DiscordIcon, tone: "" },
        { href: LINKS.support, label: t("nav.support"), icon: KofiIcon, tone: "text-kofi" },
        { href: LINKS.repo, label: t("nav.source_on_github"), icon: Code, tone: "" },
    ]);

    const FOOTER_GROUPS: {
        id: string;
        heading: string;
        links: { href: string; label: string; icon?: Component<{ class?: string }>; tone?: string; plain?: boolean }[];
    }[] = $derived([
        {
            id: "product",
            heading: t("footer.product"),
            links: [
                { href: "/features", label: t("nav.features") },
                { href: "/download", label: t("nav.download") },
                { href: "/faq", label: t("nav.faq") },
            ],
        },
        {
            id: "community",
            heading: t("footer.community"),
            links: [
                { href: discordHref(ref), label: t("nav.discord"), icon: DiscordIcon, plain: true },
                { href: LINKS.repo, label: t("nav.source"), icon: Code },
                { href: "/transparency", label: t("nav.transparency"), icon: Eye },
                { href: LINKS.support, label: t("nav.support"), icon: KofiIcon, tone: "text-kofi" },
            ],
        },
        {
            id: "legal",
            heading: t("footer.legal"),
            links: [{ href: "/privacy", label: t("nav.privacy") }],
        },
    ]);
</script>

<div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-(--z-local) border-b border-border bg-chrome/95 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-x-2 px-4 sm:px-8">
            <a
                href={local("/")}
                aria-label={t("site.home_label")}
                class="mr-auto flex h-10 min-h-[24px] min-w-[24px] items-center rounded-md sm:h-auto"
            >
                <BrandMark wordmark={false} class="sm:hidden" />
                <BrandMark class="hidden sm:inline-flex" />
            </a>
            <nav aria-label={t("nav.main_label")} class="flex items-center gap-1">
                {#each NAV as item (item.href)}
                    {@const active = page.url.pathname.startsWith(localizedHref(item.href, i18n.locale))}
                    <a
                        href={local(item.href)}
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

    <LanguageBanner />

    <main class="noir-panel flex-1">
        {@render children()}
    </main>

    <footer class="border-t border-border bg-chrome">
        <div class="mx-auto max-w-5xl px-4 py-10 text-base sm:px-8">
            <div class="flex flex-col gap-10 md:flex-row md:justify-between">
                <div class="space-y-3">
                    <a
                        href={local("/")}
                        aria-label={t("site.home_label")}
                        class="inline-flex min-h-[24px] items-center rounded-md"
                    >
                        <BrandMark />
                    </a>
                    <p class="leading-relaxed text-foreground">{t("site.tagline")}</p>
                </div>
                <nav aria-label={t("nav.footer_label")} class="flex flex-wrap gap-x-14 gap-y-8">
                    {#each FOOTER_GROUPS as group (group.id)}
                        <div>
                            <p
                                id="footer-{group.id}"
                                class="font-heading text-sm font-semibold tracking-widest text-brass uppercase"
                            >
                                {group.heading}
                            </p>
                            <ul aria-labelledby="footer-{group.id}" class="mt-3 space-y-1">
                                {#each group.links as link (link.href)}
                                    {@const Icon = link.icon}
                                    <li>
                                        <a
                                            href={link.plain ? link.href : local(link.href)}
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
            <div class="mt-10 flex flex-wrap gap-x-10 gap-y-6">
                <ThemePicker />
                <LanguagePicker />
            </div>
            <div
                class="mt-6 flex flex-col gap-x-10 gap-y-2 border-t border-border pt-6 leading-relaxed text-muted-foreground md:flex-row md:justify-between"
            >
                <p>{t("footer.license")}</p>
                <p class="md:text-right">
                    {t("footer.unofficial")}
                </p>
            </div>
        </div>
    </footer>
</div>
