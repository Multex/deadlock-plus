<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import SectionHead from "$lib/features/front-page/paper/section-head.svelte";
    import type { EditionView } from "../edition-view";

    let {
        people,
        title,
        scale = 1,
        head = true,
        row = false,
        spread = false,
    }: {
        people: NonNullable<EditionView["people"]>;
        title: string;
        scale?: number;
        /** `false` when the card around it already carries the title. */
        head?: boolean;
        /** Mates and the wanted poster side by side, for a wide card. */
        row?: boolean;
        /** Mates side by side above the poster, for a square card. */
        spread?: boolean;
    } = $props();
</script>

<section
    class="people"
    class:row
    class:spread
    style="--s: calc({scale} * var(--fit-scale, 1)); --mates: {people.mates.length};"
    aria-label={title}
>
    {#if people.mates.length > 0}
        {#if head}
            <SectionHead text={title} />
        {/if}
        <ul>
            {#each people.mates as mate (mate.id)}
                <li><b>{mate.name}</b><span>{mate.line}</span></li>
            {/each}
        </ul>
    {/if}
    {#if people.nemesis}
        <div class="wanted">
            <p class="tag">{t("dispatch.people.nemesis")}</p>
            <p class="name" data-fit-line>{people.nemesis.name}</p>
            <p class="line">{people.nemesis.line}</p>
        </div>
    {/if}
</section>

<style>
    .people {
        display: flex;
        flex-direction: column;
        gap: calc(8px * var(--s) + var(--row-gap, 0px));
        min-width: 0;
    }

    .people.row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: calc(16px * var(--s));
        align-items: center;
    }

    .spread ul {
        display: grid;
        grid-template-columns: repeat(var(--mates), minmax(0, 1fr));
        column-gap: calc(16px * var(--s));
    }

    .spread li + li {
        margin-top: 0;
    }

    ul {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: calc(12px * var(--s));
        line-height: 1.2;
    }

    li + li {
        margin-top: calc(5px * var(--s) + var(--row-gap, 0px));
    }

    li b {
        display: block;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: calc(14px * var(--s));
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    li span {
        color: var(--fp-ink-soft);
    }

    /* A wanted poster in miniature: double rule, the name in the masthead face. */
    .wanted {
        padding: calc(5px * var(--s)) calc(8px * var(--s)) calc(6px * var(--s));
        border: calc(3px * var(--s)) double var(--fp-ink);
        text-align: center;
    }

    .wanted p {
        margin: 0;
    }

    .tag {
        color: var(--fp-spot);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: calc(12px * var(--s));
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    .name {
        overflow: hidden;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(24px * var(--s) * var(--line-fit, 1));
        line-height: 1.05;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .line {
        font-size: calc(11.5px * var(--s));
        font-style: italic;
    }
</style>
