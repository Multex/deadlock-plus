<script lang="ts">
    import { onMount } from "svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { radioTarget } from "@deadlock-plus/ui/radio-group";
    import { DEFAULT_THEME, THEMES, applyTheme, loadTheme, saveTheme, type ThemeId } from "$lib/content/themes";

    let current = $state<ThemeId>(DEFAULT_THEME);
    const currentLabel = $derived(THEMES.find((t) => t.id === current)?.label);

    function select(id: ThemeId) {
        current = id;
        applyTheme(
            {
                root: document.documentElement,
                meta: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
            },
            id,
        );
        saveTheme(() => localStorage, id);
    }

    function onKeydown(e: KeyboardEvent) {
        const next = radioTarget(
            e.key,
            THEMES.findIndex((t) => t.id === current),
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
        current = loadTheme(() => localStorage);
    });
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <h2 id="theme-picker-label" class="text-sm font-semibold tracking-widest text-brass uppercase">Theme</h2>
    <div role="radiogroup" aria-labelledby="theme-picker-label" class="flex gap-1.5">
        {#each THEMES as theme (theme.id)}
            {@const selected = current === theme.id}
            <Button
                variant="unstyled"
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={theme.label}
                tabindex={selected ? 0 : -1}
                onkeydown={onKeydown}
                onclick={() => select(theme.id)}
                class="flex size-10 items-center justify-center rounded-md border transition-colors hover:bg-accent/50 {selected
                    ? 'border-brass bg-accent'
                    : 'border-transparent'}"
            >
                <span class="flex size-6 overflow-hidden rounded border">
                    {#each theme.swatch as colour (colour)}
                        <span class="flex-1" style="background: {colour}"></span>
                    {/each}
                </span>
            </Button>
        {/each}
    </div>
    <p class="text-muted-foreground" aria-hidden="true">{currentLabel}</p>
</div>
