<script lang="ts">
    import { gameArt } from "../art";
    import type { MarkupNode } from "../markup/markup";
    import GameIcon from "./game-icon.svelte";
    import Markup from "./markup.svelte";
    import { iconPaint, inlineAttributeStyle } from "./view";

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
            ><Markup nodes={node.children} {bindings} /></span
        >{:else if node.kind === "attribute"}{@const look = inlineAttributeStyle(node.name, icons)}{@const paint =
            look.icon ? iconPaint(icons[look.icon], look.wash) : null}<span class="attribute" style:color={look.color}
            >{#if paint}<span class="attribute-icon"><GameIcon {paint} size={16} /></span>{/if}{node.label ??
                node.name}</span
        >{:else if node.kind === "icon"}<span class="glyph"
            ><GameIcon paint={iconPaint(icons[node.cssClass])} size={20} fallback="currentColor" /></span
        >{:else if node.kind === "binding"}<kbd class="binding">{bindings[node.action] ?? node.action}</kbd>{/if}{/each}

<style>
    /* `.ModInfoLabel` span classes. `highlight_special` has no rule in the item tooltip's stylesheet. */
    .m-highlight {
        color: var(--tt-highlight);
        font-weight: 600;
    }
    .m-highlight_weapon,
    .m-highlight_courage {
        color: var(--game-courage-bright, #ec9719);
        font-weight: 700;
    }
    .m-highlight_tech,
    .m-highlight_spirit {
        color: var(--game-spirit-bright, #ce90ff);
        font-weight: 700;
    }
    .m-highlight_armor,
    .m-highlight_fortitude {
        color: var(--game-fortitude-bright, #7bba1d);
        font-weight: 700;
    }
    .m-isNegative {
        color: var(--tt-negative);
        font-weight: 700;
    }
    .m-diminish,
    .m-small_diminish {
        color: var(--tt-diminish);
        font-size: calc(var(--u, 1px) * 15);
        font-style: italic;
        font-weight: 600;
    }
    .m-bold {
        font-weight: 700;
    }
    .m-italic {
        font-style: italic;
    }

    /* `.InlineAttributeName` and `.InlineAttributeIcon` (16 square, margins 2 2 2). */
    .attribute {
        font-weight: 600;
    }
    .attribute-icon {
        display: inline-flex;
        margin: 0 calc(var(--u, 1px) * 2) calc(var(--u, 1px) * 2);
        vertical-align: middle;
    }
    /* `.ModInfoLabel .InlineGlyph`: 20 square. */
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
