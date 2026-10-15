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

    interface Choice {
        href: string;
        label: string;
        note: string;
    }

    let { data } = $props();

    const ref = $derived(currentRef(page.url));

    // UTC, so the server and the browser print the same day.
    const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
    const formatDate = (iso: string) => dateFormat.format(new Date(iso));

    const windows = $derived(data.releases.filter((release) => release.windows));
    const latestWindows = $derived(windows[0]);
    const olderWindows = $derived<Choice[]>(
        windows.slice(1).map((release) => ({
            href: downloadHref("windows", release.version, ref),
            label: `Version ${release.version}`,
            note: formatDate(release.date),
        })),
    );

    const linux = $derived(data.releases.filter((release) => release.deb || release.appImage));
    const latestLinux = $derived(linux[0]);
    const linuxFiles = $derived(latestLinux ? linuxChoices(latestLinux, false) : []);
    const olderLinux = $derived(linux.slice(1).flatMap((release) => linuxChoices(release, true)));

    function linuxChoices(release: (typeof data.releases)[number], withVersion: boolean): Choice[] {
        const files = [
            { file: release.deb, platform: "deb" as const, name: ".deb", note: "Ubuntu, Debian, Mint" },
            { file: release.appImage, platform: "appimage" as const, name: "AppImage", note: "Any other system" },
        ];
        return files.flatMap(({ file, platform, name, note }) =>
            file
                ? [
                      {
                          href: downloadHref(platform, release.version, ref),
                          label: withVersion ? `Version ${release.version}, ${name}` : name,
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

<Seo
    title="Download Deadlock+ for Windows and Linux (Free)"
    description="Download Deadlock+, the free companion app for Deadlock, for Windows 10 and 11 or Linux. No account needed."
/>

<Page>
    <PageHeader
        title="Download Deadlock+"
        subtitle="Deadlock+ is free. Download it, open the file, and you are ready to go."
    />

    <div class="grid gap-3 md:grid-cols-2">
        <Card as="article" padding="lg" class="border-brass/50">
            <div class="flex items-center gap-2">
                <h2 class="text-xl">Windows</h2>
                <Badge variant="success">Recommended</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">For Windows 10 and Windows 11.</p>

            <div class="mt-4 flex flex-wrap items-center gap-2">
                <a
                    href={latestWindows ? downloadHref("windows", latestWindows.version, ref) : LINKS.download}
                    class={buttonVariants({ size: "lg" })}
                >
                    <Download />
                    Download for Windows
                </a>
                {#if olderWindows.length > 0}
                    {@render menu(olderWindows, "Older versions for Windows", "Older versions", false)}
                {/if}
            </div>
            {#if latestWindows}
                <p class="mt-2 text-xs text-muted-foreground">
                    Version {latestWindows.version}, released {formatDate(latestWindows.date)}
                </p>
            {:else}
                <p class="mt-2 text-xs text-muted-foreground">
                    This opens the newest version on GitHub. Choose the file whose name ends in "setup.exe".
                </p>
            {/if}

            <ol class="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Open the file you downloaded and follow the steps.</li>
                <li>Start Deadlock+.</li>
                <li>
                    Windows asks for permission each time Deadlock+ starts. Choose <strong class="text-foreground"
                        >Yes</strong
                    >. Deadlock+ needs it because Server Picker changes Windows Firewall settings.
                </li>
            </ol>
        </Card>

        <Card as="article" id="linux" padding="lg">
            <div class="flex items-center gap-2">
                <h2 class="text-xl">Linux</h2>
                <Badge variant="warning">Best-effort</Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">It should work, but it is tested far less than Windows.</p>

            <div class="mt-4 flex flex-wrap items-center gap-2">
                {#if linuxFiles.length > 0}
                    {@render menu(linuxFiles, "Download for Linux: choose a file type", "Download for Linux", true)}
                    {#if olderLinux.length > 0}
                        {@render menu(olderLinux, "Older versions for Linux", "Older versions", false)}
                    {/if}
                {:else}
                    <a href={LINKS.download} class={buttonVariants({ variant: "outline", size: "lg" })}>
                        <Download />
                        Download for Linux
                    </a>
                {/if}
            </div>
            {#if latestLinux}
                <p class="mt-2 text-xs text-muted-foreground">
                    Version {latestLinux.version}, released {formatDate(latestLinux.date)}
                </p>
            {:else}
                <p class="mt-2 text-xs text-muted-foreground">
                    This opens the newest version on GitHub. Choose the file whose name ends in ".deb" or ".AppImage".
                </p>
            {/if}

            <p class="mt-4 text-sm text-muted-foreground">
                Some features need extra setup on Linux.
                <a href={LINKS.linux} class="underline hover:text-foreground">Read the Linux notes</a> first.
            </p>
            <p class="mt-2 text-sm text-muted-foreground">Deadlock+ does not run on macOS.</p>
        </Card>
    </div>

    <Section title="Windows says it &quot;protected your PC&quot;?" padding="lg">
        <p class="text-sm text-muted-foreground">
            Windows shows this blue screen for any app that few people have installed yet. It does not mean that
            something is wrong with the file. To carry on:
        </p>
        <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>Click <strong>More info</strong>.</li>
            <li>Click <strong>Run anyway</strong>.</li>
        </ol>
    </Section>

    <Section title="Updates" padding="lg">
        <p class="text-sm text-muted-foreground">
            Deadlock+ tells you when a new version is out. It updates only when you click, and it refuses any update
            that does not come from us.
        </p>
        <a href={LINKS.releases} class="{buttonVariants({ variant: 'outline', size: 'sm' })} mt-3">
            See what changed in each version
        </a>
    </Section>

    <Section title="Want to check it yourself?" padding="lg">
        <p class="text-sm text-muted-foreground">
            Deadlock+ is open source, so anyone can
            <a href={LINKS.repo} class="underline hover:text-foreground">read the code</a> and see exactly what it does.
        </p>
    </Section>
</Page>
