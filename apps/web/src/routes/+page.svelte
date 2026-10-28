<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { softwareApplication } from "$lib/components/structured-data";
    import { ArrowRight, Download } from "@lucide/svelte";
    import DiscordIcon from "@deadlock-plus/ui/icons/discord.svelte";
    import Shot from "$lib/components/shot.svelte";
    import { HERO_DETAIL_SHOT, HERO_SHOT, featureText, highlights } from "$lib/content/features";
    import { LINKS } from "$lib/content/links";
    import { currentRef, discordHref, withRef } from "$lib/content/ref";
    import { page } from "$app/state";
    import { around, useI18n } from "$lib/i18n";
    import features from "virtual:en/features";
    import home from "virtual:en/home";
    import { localizedHref } from "$lib/i18n/routes";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";

    const i18n = useI18n(home, features);
    const { t } = i18n;

    const ref = $derived(currentRef(page.url));

    const local = (href: string) => localizedHref(withRef(href, ref), i18n.locale);

    const description = t("home.description");

    const trust = ["free", "local", "open"].map((key) => ({
        title: t(`home.trust.${key}.title`),
        body: t(`home.trust.${key}.body`),
    }));

    const [headingBefore, headingAfter] = around(t("home.heading"), "game");
    const [platformsBefore, platformsAfter] = around(t("home.platforms"), "linux");
</script>

<Seo title={t("home.title")} {description} schema={[softwareApplication(description, i18n.locale)]} />

<Page>
    <header class="py-12 sm:py-20">
        <h1 class="max-w-3xl text-5xl leading-tight sm:text-6xl">
            {headingBefore}<span class="text-brass">Deadlock</span>{headingAfter}
        </h1>
        <p class="mt-4 max-w-2xl text-lg text-muted-foreground">
            {t("home.intro")}
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
            <a href={local("/download")} class={buttonVariants({ size: "lg" })}>
                <Download />
                {t("home.download_windows")}
            </a>
            <a href={discordHref(ref)} class={buttonVariants({ variant: "outline", size: "lg" })}>
                <DiscordIcon class="size-4" />
                {t("nav.join_discord")}
            </a>
        </div>
        <p class="mt-3 text-sm text-muted-foreground">
            {platformsBefore}<a href={local("/download#linux")} class="underline hover:text-foreground"
                >{t("home.platforms_linux")}</a
            >{platformsAfter}
        </p>
    </header>

    <Shot
        name={HERO_SHOT}
        detail={HERO_DETAIL_SHOT}
        label={t("home.hero_label")}
        eager
        class="shadow-2xl shadow-black/60"
    />

    <section>
        <div class="mb-3 flex items-end justify-between gap-3">
            <h2 class="text-2xl">{t("home.what_it_does")}</h2>
            <a href={local("/features")} class={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("home.every_feature")}
                <ArrowRight />
            </a>
        </div>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each highlights() as feature (feature.id)}
                {@const text = featureText(i18n, feature)}
                <li>
                    <Card
                        padding="none"
                        class="flex h-full flex-col overflow-hidden transition-colors hover:border-brass/50 hover:bg-accent/40"
                    >
                        {#if feature.shot}
                            <Shot
                                name={feature.shot}
                                detail={feature.detailShot}
                                label={t("home.shot_label", { name: text.name })}
                                framed={false}
                            />
                        {/if}
                        <a href={local(`/features#${feature.id}`)} class="block flex-1 border-t border-border p-4">
                            <h3 class="text-base font-semibold text-brass">{text.name}</h3>
                            <p class="mt-1 text-sm text-muted-foreground">{text.summary}</p>
                        </a>
                    </Card>
                </li>
            {/each}
        </ul>
    </section>

    <Section title={t("home.safety_title")} titleClass="mb-4">
        <ul class="grid gap-5 md:grid-cols-3">
            {#each trust as item (item.title)}
                <li class="border-l-2 border-brass pl-4">
                    <h3 class="font-semibold">{item.title}</h3>
                    <p class="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </li>
            {/each}
        </ul>
        <div class="mt-5 flex flex-wrap gap-2">
            <a href={LINKS.repo} class={buttonVariants({ variant: "outline", size: "sm" })}>{t("home.read_code")}</a>
            <a href={local("/privacy")} class={buttonVariants({ variant: "outline", size: "sm" })}>{t("nav.privacy")}</a
            >
            <a href={local("/transparency")} class={buttonVariants({ variant: "outline", size: "sm" })}
                >{t("nav.transparency")}</a
            >
            <a href={local("/faq")} class={buttonVariants({ variant: "outline", size: "sm" })}>{t("nav.faq")}</a>
        </div>
    </Section>

    <Section class="flex flex-wrap items-center justify-between gap-4" padding="lg">
        <div>
            <h2 class="text-xl">{t("home.ready_title")}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                {t("home.ready_body")}
            </p>
        </div>
        <a href={local("/download")} class={buttonVariants()}>
            <Download />
            {t("nav.download")}
        </a>
    </Section>
</Page>
