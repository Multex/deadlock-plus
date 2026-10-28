<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { ChevronDown, Download } from "@lucide/svelte";
    import { LINKS } from "$lib/content/links";
    import { currentRef, downloadHref } from "$lib/content/ref";
    import { page } from "$app/state";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
    import { around, useI18n } from "$lib/i18n";
    import download from "virtual:en/download";

    interface Choice {
        href: string;
        label: string;
        note: string;
    }

    let { data } = $props();

    const { t, locale } = useI18n(download);

    const ref = $derived(currentRef(page.url));

    // UTC, so the server and the browser print the same day.
    const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
        dateStyle: "medium",
        timeZone: "UTC",
    });
    const formatDate = (iso: string) => dateFormat.format(new Date(iso));

    const windows = $derived(data.releases.filter((release) => release.windows));
    const latestWindows = $derived(windows[0]);
    const olderWindows = $derived<Choice[]>(
        windows.slice(1).map((release) => ({
            href: downloadHref("windows", release.version, ref),
            label: t("download.version", { version: release.version }),
            note: formatDate(release.date),
        })),
    );

    const linux = $derived(data.releases.filter((release) => release.deb || release.appImage));
    const latestLinux = $derived(linux[0]);
    const linuxFiles = $derived(latestLinux ? linuxChoices(latestLinux, false) : []);
    const olderLinux = $derived(linux.slice(1).flatMap((release) => linuxChoices(release, true)));

    const [adminBefore, adminAfter] = around(t("download.windows.step_admin"), "yes");
    const [setupBefore, setupAfter] = around(t("download.linux.setup"), "link");
    const [clickBefore, clickAfter] = around(t("download.smartscreen.step"), "button");
    const [checkBefore, checkAfter] = around(t("download.check.body"), "link");

    function linuxChoices(release: (typeof data.releases)[number], withVersion: boolean): Choice[] {
        const files = [
            { file: release.deb, platform: "deb" as const, name: ".deb", note: t("download.deb_note") },
            {
                file: release.appImage,
                platform: "appimage" as const,
                name: "AppImage",
                note: t("download.appimage_note"),
            },
        ];
        return files.flatMap(({ file, platform, name, note }) =>
            file
                ? [
                      {
                          href: downloadHref(platform, release.version, ref),
                          label: withVersion
                              ? t("download.version_file", { version: release.version, file: name })
                              : name,
                          note: withVersion ? formatDate(release.date) : note,
                      },
                  ]
                : [],
        );
    }
</script>

{#snippet menu(choices: Choice[], name: string, text: string, primary: boolean)}
    <DropdownMenu.Root>
        <DropdownMenu.Trigger
            aria-label={name}
            class={buttonVariants({ variant: primary ? "default" : "outline", size: "lg" })}
        >
            {#if primary}<Download />{/if}
            {text}
            <ChevronDown />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="max-h-72 min-w-60 overflow-y-auto">
            {#each choices as choice (choice.href)}
                <DropdownMenu.Item class="justify-between gap-6">
                    {#snippet child({ props })}
                        <a {...props} href={choice.href}>
                            <span class="font-medium">{choice.label}</span>
                            <span class="text-xs text-muted-foreground">{choice.note}</span>
                        </a>
                    {/snippet}
                </DropdownMenu.Item>
            {/each}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/snippet}

<Seo title={t("download.title")} description={t("download.description")} />

<Page>
    <PageHeader title={t("download.heading")} subtitle={t("download.subtitle")} />

    <div class="grid gap-3 md:grid-cols-2">
        <Card as="article" padding="lg" class="border-brass/50">
            <div class="flex items-center gap-2">
                <h2 class="text-xl">{t("download.windows.name")}</h2>
                <Badge variant="success">{t("download.windows.badge")}</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">{t("download.windows.for")}</p>

            <div class="mt-4 flex flex-wrap items-center gap-2">
                <a
                    href={latestWindows ? downloadHref("windows", latestWindows.version, ref) : LINKS.download}
                    class={buttonVariants({ size: "lg" })}
                >
                    <Download />
                    {t("download.windows.button")}
                </a>
                {#if olderWindows.length > 0}
                    {@render menu(olderWindows, t("download.windows.older_label"), t("download.older_versions"), false)}
                {/if}
            </div>
            {#if latestWindows}
                <p class="mt-2 text-xs text-muted-foreground">
                    {t("download.released", {
                        version: latestWindows.version,
                        date: formatDate(latestWindows.date),
                    })}
                </p>
            {:else}
                <p class="mt-2 text-xs text-muted-foreground">
                    {t("download.windows.fallback")}
                </p>
            {/if}

            <ol class="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("download.windows.step_open")}</li>
                <li>{t("download.windows.step_start")}</li>
                <li>
                    {adminBefore}<strong class="text-foreground">{t("download.windows.step_admin_yes")}</strong
                    >{adminAfter}
                </li>
            </ol>
        </Card>

        <Card as="article" id="linux" padding="lg">
            <div class="flex items-center gap-2">
                <h2 class="text-xl">{t("download.linux.name")}</h2>
                <Badge variant="warning">{t("download.linux.badge")}</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">{t("download.linux.for")}</p>

            <div class="mt-4 flex flex-wrap items-center gap-2">
                {#if linuxFiles.length > 0}
                    {@render menu(linuxFiles, t("download.linux.choose_label"), t("download.linux.button"), true)}
                    {#if olderLinux.length > 0}
                        {@render menu(olderLinux, t("download.linux.older_label"), t("download.older_versions"), false)}
                    {/if}
                {:else}
                    <a href={LINKS.download} class={buttonVariants({ variant: "outline", size: "lg" })}>
                        <Download />
                        {t("download.linux.button")}
                    </a>
                {/if}
            </div>
            {#if latestLinux}
                <p class="mt-2 text-xs text-muted-foreground">
                    {t("download.released", { version: latestLinux.version, date: formatDate(latestLinux.date) })}
                </p>
            {:else}
                <p class="mt-2 text-xs text-muted-foreground">
                    {t("download.linux.fallback")}
                </p>
            {/if}

            <p class="mt-4 text-sm text-muted-foreground">
                {setupBefore}<a href={LINKS.linux} class="underline hover:text-foreground"
                    >{t("download.linux.setup_link")}</a
                >{setupAfter}
            </p>
            <p class="mt-2 text-sm text-muted-foreground">{t("download.linux.no_mac")}</p>
        </Card>
    </div>

    <Section title={t("download.smartscreen.title")} padding="lg">
        <p class="text-sm text-muted-foreground">
            {t("download.smartscreen.body")}
        </p>
        <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>{clickBefore}<strong>{t("download.smartscreen.more_info")}</strong>{clickAfter}</li>
            <li>{clickBefore}<strong>{t("download.smartscreen.run_anyway")}</strong>{clickAfter}</li>
        </ol>
    </Section>

    <Section title={t("download.updates.title")} padding="lg">
        <p class="text-sm text-muted-foreground">
            {t("download.updates.body")}
        </p>
        <a href={LINKS.releases} class="{buttonVariants({ variant: 'outline', size: 'sm' })} mt-3">
            {t("download.updates.changes")}
        </a>
    </Section>

    <Section title={t("download.check.title")} padding="lg">
        <p class="text-sm text-muted-foreground">
            {checkBefore}<a href={LINKS.repo} class="underline hover:text-foreground">{t("download.check.link")}</a
            >{checkAfter}
        </p>
    </Section>
</Page>
