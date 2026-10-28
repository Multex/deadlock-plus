<script lang="ts">
    import { onMount } from "svelte";
    import { ExternalLink } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { THEMES, themeKey, type ThemeId } from "$lib/content/themes";
    import { themeState } from "$lib/content/theme-state.svelte";
    import { useI18n } from "$lib/i18n";

    const { t } = useI18n();

    const current = $derived(themeState.theme);
    const currentLabel = $derived(t(`themes.${themeKey(current)}`));
    const active = $derived(THEMES.find((entry) => entry.id === current));
    const flavours = $derived(active?.variants.map((v) => ({ value: v.id, label: v.name })) ?? []);

    function select(id: ThemeId) {
        themeState.pick(id);
    }

    function onKeydown(e: KeyboardEvent) {
        const next = radioTarget(
            e.key,
            THEMES.findIndex((theme) => theme.id === current),
            THEMES.length,
        );
        const theme = next === null ? undefined : THEMES[next];
        if (!theme) return;
        e.preventDefault();
        select(theme.id);
        const radios =
            e.currentTarget instanceof HTMLElement
                ? (e.currentTarget.parentElement?.querySelectorAll("[role=radio]") ?? [])
                : [];
        (radios[THEMES.indexOf(theme)] as HTMLElement | undefined)?.focus();
    }

    onMount(() => {
        themeState.load();
    });
</script>

<div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p id="theme-picker-label" class="font-heading text-sm font-semibold tracking-widest text-brass uppercase">
            {t("footer.theme")}
        </p>
        <div role="radiogroup" aria-labelledby="theme-picker-label" class="flex flex-wrap gap-1.5">
            {#each THEMES as theme (theme.id)}
                {@const selected = current === theme.id}
                {@const swatch =
                    (selected && theme.variants.find((v) => v.id === themeState.variant)?.swatch) || theme.swatch}
                <Button
                    variant="unstyled"
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(`themes.${themeKey(theme.id)}`)}
                    tabindex={selected ? 0 : -1}
                    onkeydown={onKeydown}
                    onclick={() => select(theme.id)}
                    class="flex size-10 items-center justify-center rounded-md border transition-colors hover:bg-accent/50 {selected
                        ? 'border-brass bg-accent'
                        : 'border-transparent'}"
                >
                    <span class="flex size-6 overflow-hidden rounded border">
                        {#each swatch as colour, i (i)}
                            <span class="flex-1" style="background: {colour}"></span>
                        {/each}
                    </span>
                </Button>
            {/each}
        </div>
        <p class="text-muted-foreground" aria-hidden="true">{currentLabel}</p>
    </div>
    {#if active?.effects || active?.variants.length || active?.source}
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
            {#if active.effects}
                <div class="flex items-center gap-2.5">
                    <Switch
                        id="theme-effects"
                        checked={themeState.effects}
                        onCheckedChange={(on) => themeState.setEffects(on)}
                    />
                    <label for="theme-effects" class="text-foreground">{t("themes.effects")}</label>
                </div>
            {/if}
            {#if active.variants.length}
                <div class="flex items-center gap-2.5">
                    <span id="theme-flavour-label" class="text-foreground">{t("themes.flavour")}</span>
                    <SelectMenu
                        class="w-40"
                        items={flavours}
                        value={themeState.variant}
                        aria-labelledby="theme-flavour-label"
                        onValueChange={(id) => themeState.pickVariant(id)}
                    >
                        {#snippet leading(item)}
                            {@const colours = active.variants.find((v) => v.id === item.value)?.swatch}
                            <span
                                class="grid size-full place-items-center rounded ring-1 ring-border ring-inset"
                                style:background={colours?.[0]}
                                aria-hidden="true"
                            >
                                <span class="size-2 rounded-full" style:background={colours?.[2]}></span>
                            </span>
                        {/snippet}
                    </SelectMenu>
                </div>
            {/if}
            {#if active.source}
                <a
                    href={active.source}
                    class="-mx-2 inline-flex h-9 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-brass focus-visible:bg-accent/50 focus-visible:text-brass"
                >
                    <ExternalLink class="size-4 shrink-0" aria-hidden="true" />
                    {t("themes.based_on", { source: t(`themes.sources.${themeKey(active.id)}`) })}
                </a>
            {/if}
        </div>
    {/if}
</div>
