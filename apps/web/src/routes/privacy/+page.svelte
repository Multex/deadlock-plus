<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { LINKS } from "$lib/content/links";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
</script>

<Seo
    title="Privacy | Deadlock+"
    description="What this website records, and where to read what the Deadlock+ app sends."
/>

<Page>
    <PageHeader title="Privacy" subtitle="What is recorded, and by what." />

    <Section title="This website" padding="lg">
        <ul class="list-disc space-y-1.5 pl-5 text-sm">
            <li>No cookies and no tracking script.</li>
            <li>
                Each page view is counted with the page, your country, and the site that linked you here. Only that
                site's address is kept, never the exact page you came from.
            </li>
            <li>A click on a Discord link here is counted the same way, with the name of the link.</li>
            <li>A click on a download is counted too, with the file type, the version and your country.</li>
            <li>
                Each count also carries the text your browser sends about itself: its name, version and operating
                system. It is only used to tell people apart from automated traffic.
            </li>
            <li>
                If you arrive through a link with a source tag, for example from a video, that tag stays in the address
                while you browse. This lets the site tell which link brought a download. It does not identify you.
            </li>
            <li>Your IP address is not stored or passed on.</li>
            <li>Every count has a fresh random ID, so two visits cannot be tied to one person.</li>
            <li>
                Once an hour, the site reads how many times each Discord invite was used. That is a total, with no
                names.
            </li>
            <li>The download page asks GitHub for the list of Deadlock+ versions. Nothing about you is sent.</li>
        </ul>
        <p class="mt-3 text-sm text-muted-foreground">
            The counts are stored with <a href="https://posthog.com" class="underline hover:text-foreground">PostHog</a
            >.
        </p>
    </Section>

    <Section title="The app" padding="lg">
        <p class="text-sm">
            Deadlock+ runs on your PC. The few things it sends over the network are listed, one by one, on the app's
            GitHub page.
        </p>
        <a href={LINKS.appPrivacy} class="{buttonVariants({ variant: 'outline', size: 'sm' })} mt-3">
            Read the app's privacy list
        </a>
    </Section>
</Page>
