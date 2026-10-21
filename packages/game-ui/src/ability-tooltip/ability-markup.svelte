<script lang="ts">
    import { gameArt } from "../art";
    import GameIcon from "../item-tooltip/game-icon.svelte";
    import { iconPaint } from "../item-tooltip/view";
    import type { MarkupNode } from "../markup/markup";
    import AbilityMarkup from "./ability-markup.svelte";

    type Props = {
        nodes: readonly MarkupNode[];
        /** Key labels by the game's action name; a binding without one shows the action name. */
        bindings?: Partial<Record<string, string>>;
    };

    let { nodes, bindings = {} }: Props = $props();

    const art = gameArt();
    const icons = $derived(art().propertyIcons);
</script>

{#each nodes as node, i (i)}{#if node.kind === "text"}{node.text}{:else if node.kind === "value"}{node.text}{:else if node.kind === "break"}<br
        />{:else if node.kind === "span"}<span class={node.styles.map((style) => `m-${style}`)}
            ><AbilityMarkup nodes={node.children} {bindings} /></span
        >{:else if node.kind === "attribute"}{@const paint = iconPaint(icons[node.name])}<span class="attribute"
            >{#if paint}<span class="attribute-icon"><GameIcon {paint} size={16} /></span>{/if}{node.label ??
                node.name}</span
        >{:else if node.kind === "icon"}<span class="glyph"
            ><GameIcon paint={iconPaint(icons[node.cssClass])} size={20} fallback="currentColor" /></span
        >{:else if node.kind === "binding"}<kbd class="binding">{bindings[node.action] ?? node.action}</kbd>{/if}{/each}

<style>
    /* `.PropertiesBlockHeaderLabel` span classes. */
    .m-highlight {
        color: var(--at-highlight);
        font-weight: 600;
    }
    .m-highlight_weapon {
        color: var(--at-weapon);
        font-weight: 700;
    }
    .m-highlight_courage {
        color: var(--at-courage);
        font-weight: 700;
    }
    .m-highlight_tech {
        color: var(--at-tech);
        font-weight: 700;
    }
    .m-highlight_spirit {
        color: var(--at-spirit);
        font-weight: 700;
    }
    .m-highlight_armor {
        color: var(--at-armor);
        font-weight: 700;
    }
    .m-highlight_fortitude {
        color: var(--at-fortitude);
        font-weight: 700;
    }
    .m-highlight_special {
        color: var(--at-special);
        font-weight: 700;
    }
    .m-diminish,
    .m-small_diminish {
        color: var(--at-diminish);
        font-style: italic;
    }
    .m-small_diminish {
        font-size: calc(var(--u, 1px) * 14);
    }
    .m-bold {
        font-weight: 700;
    }
    .m-italic {
        font-style: italic;
    }

    .attribute {
        font-weight: 600;
    }
    .attribute-icon {
        display: inline-flex;
        margin: 0 calc(var(--u, 1px) * 2) calc(var(--u, 1px) * 2);
        vertical-align: middle;
    }
    /* `.PropertiesBlockHeaderLabel .InlineGlyph`: 20 square. */
    .glyph {
        display: inline-flex;
        vertical-align: middle;
    }
    .binding {
        display: inline-block;
        padding: 0 calc(var(--u, 1px) * 5);
        border: calc(var(--u, 1px) * 1) solid currentColor;
        border-radius: calc(var(--u, 1px) * 3);
        font-family: var(--game-font-sans);
        font-size: 0.85em;
        font-weight: 700;
        line-height: 1.2;
        text-transform: uppercase;
    }
</style>
