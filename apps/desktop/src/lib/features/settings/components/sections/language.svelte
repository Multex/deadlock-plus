<script lang="ts">
    import { onMount } from "svelte";
    import { Globe } from "@lucide/svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Flag from "$lib/components/flag.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { SUPPORTED_LOCALES, formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import { prefs } from "$lib/core/prefs";
    import { languageOptions } from "../../languages";

    let { show }: { show: (id: string) => boolean } = $props();

    let language = $state(prefs.getString("language", "system"));

    onMount(() => {
        void i18n.preload(SUPPORTED_LOCALES);
    });

    const options = $derived(languageOptions(SUPPORTED_LOCALES, i18n.catalogs, i18n.catalogs.en));
    const active = $derived(options.some((o) => o.code === language && o.available) ? language : "system");
    const selectable = $derived(["system", ...options.filter((o) => o.available).map((o) => o.code)]);
    const current = $derived(options.find((o) => o.code === i18n.locale)?.name ?? i18n.locale);

    function choose(code: string) {
        language = code;
        void i18n.setLanguage(code);
    }

    function inCurrentLocale(code: string, name: string): string | null {
        try {
            const label = new Intl.DisplayNames([i18n.locale], { type: "language" }).of(code);
            return label && label.toLowerCase() !== name.toLowerCase() ? label : null;
        } catch {
            return null;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        const next = radioTarget(e.key, selectable.indexOf(active), selectable.length);
        if (next === null) return;
        e.preventDefault();
        choose(selectable[next]);
        const radios = e.currentTarget instanceof HTMLElement ? e.currentTarget.parentElement : null;
        (radios?.querySelectorAll("[role=radio]:not(:disabled)")[next] as HTMLElement | undefined)?.focus();
    }

    const rowClass =
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";
</script>

{#if show("language")}
    <Card as="section" padding="none" class="overflow-hidden">
        <div class="flex flex-col gap-1 border-b px-4 py-3">
            <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.language.label")}</h3>
            <p class="text-sm text-muted-foreground">{t("settings.language.description")}</p>
        </div>
        <div role="radiogroup" aria-label={t("settings.language.label")} class="flex flex-col divide-y">
            <Button
                variant="unstyled"
                type="button"
                role="radio"
                aria-checked={active === "system"}
                tabindex={active === "system" ? 0 : -1}
                onkeydown={onKeydown}
                onclick={() => choose("system")}
                class="{rowClass} {active === 'system' ? 'bg-accent' : ''}"
            >
                {@render dot(active === "system")}
                <Globe class="size-5 shrink-0 text-muted-foreground" />
                <span class="flex min-w-0 flex-1 flex-col">
                    <span class="text-sm font-semibold">{t("settings.language.system")}</span>
                    <span class="text-xs text-muted-foreground">
                        {t("settings.language.system_current", { language: current })}
                    </span>
                </span>
            </Button>
            {#each options as option (option.code)}
                {@const selected = active === option.code}
                {@const localized = inCurrentLocale(option.code, option.name)}
                <Button
                    variant="unstyled"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!option.available}
                    tabindex={selected ? 0 : -1}
                    onkeydown={onKeydown}
                    onclick={() => choose(option.code)}
                    class="{rowClass} {selected ? 'bg-accent' : ''}"
                >
                    {@render dot(selected)}
                    <Flag code={option.flag} />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="text-sm font-semibold" lang={option.code}>{option.name}</span>
                        {#if localized}
                            <span class="text-xs text-muted-foreground">{localized}</span>
                        {/if}
                    </span>
                    {#if !option.available}
                        <Badge variant="outline">{t("settings.language.coming_soon")}</Badge>
                    {/if}
                    <span class="flex w-28 shrink-0 flex-col gap-1">
                        <span class="text-right text-xs tabular-nums text-muted-foreground">
                            {t("settings.language.translated", { percent: formatNumber(option.completion) })}
                        </span>
                        <span class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <span class="block h-full rounded-full bg-brass" style="width: {option.completion}%"></span>
                        </span>
                    </span>
                </Button>
            {/each}
        </div>
        <p class="border-t px-4 py-3 text-xs text-muted-foreground">{t("settings.language.completion_hint")}</p>
    </Card>
{/if}

{#snippet dot(selected: boolean)}
    <span
        class="flex size-4 shrink-0 items-center justify-center rounded-full border {selected
            ? 'border-brass'
            : 'border-muted-foreground/50'}"
        aria-hidden="true"
    >
        {#if selected}
            <span class="size-2 rounded-full bg-brass"></span>
        {/if}
    </span>
{/snippet}
