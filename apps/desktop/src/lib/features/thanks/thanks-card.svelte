<script lang="ts">
    import { Heart } from "@lucide/svelte";
    import { openLink } from "$lib/core/open-link";
    import { i18n, t, tn } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { THANKS, donatorsOthersKey, isEmpty, translatorLanguages, type Person } from "./thanks";

    const open = (url: string) => void openLink(url);
</script>

{#snippet name(p: Person)}
    {#if p.url}
        {@const url = p.url}
        <button type="button" class="text-primary underline-offset-2 hover:underline" onclick={() => open(url)}>
            {p.name}
        </button>
    {:else}
        <span>{p.name}</span>
    {/if}
{/snippet}

<Card as="section">
    <div class="flex items-center gap-2">
        <Heart class="size-4 text-primary" />
        <h2 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.thanks")}</h2>
    </div>
    <p class="mt-1 text-sm text-muted-foreground">{t("settings.thanks.intro")}</p>

    {#if isEmpty(THANKS)}
        <p class="mt-3 text-sm text-muted-foreground">{t("settings.thanks.nobody_yet")}</p>
    {:else}
        <div class="mt-3 flex flex-col gap-4">
            {#if THANKS.contributors.length > 0}
                <div>
                    <h3 class="text-xs uppercase tracking-widest text-muted-foreground/70">
                        {t("settings.thanks.contributors")}
                    </h3>
                    <p class="mb-1 text-xs text-muted-foreground">{t("settings.thanks.contributors_description")}</p>
                    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {#each THANKS.contributors as p (p.name)}
                            <li>{@render name(p)}</li>
                        {/each}
                    </ul>
                </div>
            {/if}
            {#if THANKS.translators.length > 0}
                <div>
                    <h3 class="text-xs uppercase tracking-widest text-muted-foreground/70">
                        {t("settings.thanks.translators")}
                    </h3>
                    <p class="mb-1 text-xs text-muted-foreground">{t("settings.thanks.translators_description")}</p>
                    <ul class="flex flex-col gap-1 text-sm">
                        {#each THANKS.translators as p (p.name)}
                            {@const languages = translatorLanguages(p, i18n.locale)}
                            <li>
                                {@render name(p)}
                                {#if languages.length > 0}
                                    <span class="text-muted-foreground">- {languages.join(", ")}</span>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
            {#if THANKS.donators.names.length > 0 || THANKS.donators.others > 0}
                <div>
                    <h3 class="text-xs uppercase tracking-widest text-muted-foreground/70">
                        {t("settings.thanks.donators")}
                    </h3>
                    <p class="mb-1 text-xs text-muted-foreground">{t("settings.thanks.donators_description")}</p>
                    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {#each THANKS.donators.names as n (n)}
                            <li>{n}</li>
                        {/each}
                        {#if THANKS.donators.others > 0}
                            <li class="text-muted-foreground">
                                {tn(donatorsOthersKey(THANKS.donators.names), THANKS.donators.others)}
                            </li>
                        {/if}
                    </ul>
                </div>
            {/if}
        </div>
    {/if}
    <SupportButton variant="outline" class="mt-4" />
</Card>
