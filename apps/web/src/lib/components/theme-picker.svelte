<script lang="ts">
    import { onMount, type Component, type ComponentProps } from "svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { THEMES, themeKey, type ThemeId } from "$lib/content/themes";
    import { themeState } from "$lib/content/theme-state.svelte";
    import { useI18n } from "$lib/i18n";
    import type ThemeOptions from "./theme-options.svelte";

    const { t } = useI18n();

    const current = $derived(themeState.theme);
    const currentLabel = $derived(t(`themes.${themeKey(current)}`));
    const active = $derived(THEMES.find((entry) => entry.id === current));

    let Options = $state<Component<ComponentProps<typeof ThemeOptions>> | null>(null);

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

    // The switch, flavour menu and credit sit at the foot of the page and depend on the stored theme, so they load
    // after it rather than weigh on every page's first load.
    onMount(() => {
        themeState.load();
        import("./theme-options.svelte").then((module) => (Options = module.default));
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
    {#if Options && active}
        <Options theme={active} />
    {/if}
</div>
