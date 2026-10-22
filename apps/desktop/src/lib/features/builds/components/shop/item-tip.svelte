<script lang="ts">
    import type { Snippet } from "svelte";
    import { ItemTooltip, itemTooltipModel } from "@deadlock-plus/game-ui";
    import { gameArt } from "@deadlock-plus/game-ui/art";
    import { gameText } from "@deadlock-plus/game-ui/text";
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { i18n } from "$lib/core/i18n.svelte";
    import { abilityTooltipsRevision, heroAbilityTooltips } from "../../ability-tooltip";
    import { drag } from "../../editor/drag.svelte";
    import { buildsHero } from "../../game-ui-host.svelte";
    import {
        altWatch,
        heroStatIcon,
        heroStatLabel,
        hoverProps,
        itemTipSource,
        tipInput,
        tipSide,
        TIP_BINDINGS,
    } from "./item-tips";

    let {
        id,
        delay = 250,
        children,
    }: {
        /** Undefined draws the trigger without a tooltip. */
        id: number | undefined;
        delay?: number;
        /** The trigger; spread the props on its element. */
        children: Snippet<[Record<string, unknown>]>;
    } = $props();

    const source = itemTipSource();
    const art = gameArt();
    const current = $derived(id === undefined ? null : source());

    let open = $state(false);
    let alt = $state(false);
    const watch = altWatch(window, (held) => (alt = held));
    $effect(() => watch.open(open));
    $effect(() => () => watch.dispose());

    const heroId = $derived(current?.build?.heroId ?? current?.popularity?.heroId ?? null);
    const hero = $derived(open && heroId !== null ? buildsHero(heroId) : null);

    let abilityTooltips = $state.raw<ReadonlyMap<number, AbilityTooltip> | undefined>(undefined);
    $effect(() => {
        if (!open || !current?.kit) return;
        let live = true;
        abilityTooltipsRevision();
        void heroAbilityTooltips(i18n.locale).then((read) => {
            if (live) abilityTooltips = read;
        });
        return () => {
            live = false;
        };
    });

    const label = heroStatLabel(gameText());
    const icon = heroStatIcon(art);
</script>

{#if current && id !== undefined}
    {@const tip = current}
    {@const itemId = id}
    <Tooltip.Root bind:open delayDuration={delay} disableHoverableContent disabled={drag.current !== null}>
        <Tooltip.Trigger tabindex={-1}>
            {#snippet child({ props })}
                {@render children(hoverProps(props, (on) => watch.hover(on)))}
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            class="max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
        >
            {#snippet child({ props, wrapperProps })}
                {@const input = tipInput(tip, itemId, {
                    hero: hero?.stats ?? null,
                    heroIcon: hero?.icon ?? tip.popularity?.icon ?? null,
                    label,
                    icon,
                    position: tipSide(props["data-side"]),
                    detailView: alt,
                    abilityTooltips,
                })}
                <div {...wrapperProps}>
                    <div {...props}>
                        {#if input}
                            <ItemTooltip
                                model={itemTooltipModel(input)}
                                bindings={TIP_BINDINGS}
                                data-item-tooltip={itemId}
                            />
                        {/if}
                    </div>
                </div>
            {/snippet}
        </Tooltip.Content>
    </Tooltip.Root>
{:else}
    {@render children({})}
{/if}
