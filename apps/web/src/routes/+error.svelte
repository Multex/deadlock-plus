<script lang="ts">
    import Seo from "$lib/components/seo.svelte";
    import { page } from "$app/state";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import { useI18n } from "$lib/i18n";
    import { localizedHref } from "$lib/i18n/routes";

    const i18n = useI18n();
    const { t } = i18n;
    const missing = $derived(page.status === 404);
</script>

<Seo title="{missing ? t('error.not_found_title') : t('error.failed')} | Deadlock+" noindex />

<Page class="items-center justify-center text-center">
    <p class="text-sm font-semibold tracking-widest text-brass">{page.status}</p>
    <h1 class="text-3xl">{missing ? t("error.not_found") : t("error.failed")}</h1>
    <a href={localizedHref("/", i18n.locale)} class={buttonVariants()}>{t("error.home")}</a>
</Page>
