<script lang="ts">
    import { fitLines } from "../../components/fill";
    import type { YearEndPoster } from "./year-end-view";

    let { poster }: { poster: YearEndPoster } = $props();

    let root = $state<HTMLElement | null>(null);
    const first = $derived(poster.heroes[0]);
    const rest = $derived(poster.heroes.slice(1));

    $effect(() => {
        void poster;
        const el = root;
        if (!el) return;
        let live = true;
        fitLines(el);
        void document.fonts?.ready.then(() => live && fitLines(el));
        return () => (live = false);
    });
</script>

<div class="poster" bind:this={root}>
    <header class="band">
        <div class="kicker">
            <span data-fit-line>{poster.kicker.name}</span>
            <span data-fit-line>{poster.kicker.issue}</span>
            <span data-fit-line>{poster.kicker.span}</span>
        </div>
        <h1 class="headline" data-fit-line>
            {poster.title.before}{#if poster.title.player}<em>{poster.title.player}</em>{/if}{poster.title.after}
        </h1>
    </header>

    <section class="numbers">
        <h2>{poster.numbersTitle}</h2>
        <dl>
            {#each poster.cells as cell (cell.id)}
                <div class="cell">
                    <dd data-fit-line>{cell.value}</dd>
                    <dt data-fit-line>{cell.label}</dt>
                </div>
            {/each}
        </dl>
        {#if poster.kda}
            <p class="kda" data-fit-line>{poster.kda.label} <strong>{poster.kda.value}</strong></p>
        {/if}
    </section>

    {#if first}
        <section class="heroes">
            <h2>{poster.heroesTitle}</h2>
            <div class="lead">
                <div class="portrait big">
                    {#if first.art}<img src={first.art} alt="" />{/if}
                    <span class="medal">1</span>
                </div>
                <div class="lead-text">
                    <p class="tag">{poster.heroTag}</p>
                    <p class="hero-name" data-fit-line>{first.name}</p>
                    <p class="hero-line" data-fit-line>{first.games}</p>
                    {#if first.record}<p class="hero-line" data-fit-line>{first.record}</p>{/if}
                </div>
            </div>
            <ol class="others">
                {#each rest as hero, i (hero.id)}
                    <li>
                        <div class="portrait">
                            {#if hero.art}<img src={hero.art} alt="" />{/if}
                            <span class="medal small">{i + 2}</span>
                        </div>
                        <p class="mini-name" data-fit-line>{hero.name}</p>
                        <p class="mini-line" data-fit-line>{hero.games}</p>
                    </li>
                {/each}
            </ol>
        </section>
    {/if}

    <section class="side">
        {#if poster.streak}
            <div class="streak">
                <span class="streak-value" data-fit-line>{poster.streak.value}</span>
                <div class="streak-text">
                    <h2 data-fit-line>{poster.streak.title}</h2>
                    <p class="streak-line" data-fit-line>{poster.streak.line}</p>
                </div>
            </div>
        {/if}
        {#if poster.bestGame}
            <div class="goty">
                <h2>{poster.bestGame.title}</h2>
                <div class="goty-row">
                    <div class="thumb">
                        {#if poster.bestGame.art}<img src={poster.bestGame.art} alt="" />{/if}
                    </div>
                    <div class="goty-text">
                        <p class="goty-hero" data-fit-line>{poster.bestGame.hero} · {poster.bestGame.kda}</p>
                        <p class="goty-line" data-fit-line>
                            {#if poster.bestGame.grade}<strong>{poster.bestGame.grade}</strong>{" · "}{/if}{poster
                                .bestGame.date}
                        </p>
                    </div>
                </div>
            </div>
        {/if}
        <div class="people">
            {#if poster.mates}
                <h2>{poster.mates.title}</h2>
                <ul>
                    {#each poster.mates.rows as mate (mate.id)}
                        <li>
                            <span class="who" data-fit-line>{mate.name}</span>
                            <span class="what">{mate.line}</span>
                        </li>
                    {/each}
                </ul>
            {/if}
            {#if poster.nemesis}
                <h2 class="nem-head">{poster.nemesis.title}</h2>
                <p class="nemesis">
                    <span class="who" data-fit-line>{poster.nemesis.row.name}</span>
                    <span class="what">{poster.nemesis.row.line}</span>
                </p>
            {/if}
        </div>
    </section>

    {#if poster.months}
        <section class="months">
            <h2>
                {poster.months.title} <span>· {poster.months.sub}</span>
                <span class="key"><i></i>{poster.months.won}</span>
            </h2>
            <ol>
                {#each poster.months.bars as month (month.id)}
                    <li class:busiest={month.busiest}>
                        <span class="count">{month.count}</span>
                        <span class="month-bar" style="height: {month.height}px">
                            <span class="won" style="height: {month.winHeight}px"></span>
                        </span>
                        <span class="month-label">{month.label}</span>
                    </li>
                {/each}
            </ol>
        </section>
    {/if}
</div>

<style>
    .poster {
        --paper: oklch(0.93 0.022 86);
        --ink: oklch(0.2 0.01 80);
        --ink-soft: oklch(0.38 0.02 78);
        --gold: oklch(0.8 0.11 85);
        --gold-ink: oklch(0.47 0.095 76);
        --gold-fill: oklch(0.68 0.12 82);
        --black: oklch(0.17 0.01 80);
        position: relative;
        width: 1800px;
        height: 900px;
        color: var(--ink);
        background:
            radial-gradient(ellipse at 50% 40%, transparent 55%, oklch(0.5 0.04 80 / 0.14)),
            linear-gradient(115deg, oklch(1 0 0 / 0.22), transparent 30%, transparent 70%, oklch(1 0 0 / 0.12)),
            var(--paper);
        font-family: "Retail Demo", sans-serif;
    }

    h1,
    h2,
    p,
    dl,
    dd,
    ol,
    ul {
        margin: 0;
        padding: 0;
    }

    h2 {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--gold-ink);
    }

    [data-fit-line] {
        overflow: hidden;
        white-space: nowrap;
    }

    .band {
        position: absolute;
        inset: 0 0 auto;
        height: 140px;
        color: var(--paper);
        background: linear-gradient(180deg, oklch(1 0 0 / 0.06), transparent), var(--black);
        border-bottom: 5px solid var(--gold-fill);
    }

    /* One kicker per panel, so none of them sits across a fold. */
    .kicker {
        display: grid;
        grid-template-columns: repeat(3, 520px);
        justify-content: space-around;
        padding-top: 16px;
        text-align: center;
        font-weight: 600;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        color: var(--gold);
    }

    .kicker span {
        font-size: calc(15px * var(--line-fit, 1));
    }

    .headline {
        display: block;
        margin: 4px 60px 0;
        font-family: "Valve Pulp", sans-serif;
        font-size: calc(80px * var(--line-fit, 1));
        font-weight: 700;
        line-height: 1.12;
        text-align: center;
        text-transform: uppercase;
        color: var(--paper);
    }

    .headline em {
        font-style: normal;
        color: transparent;
        background: linear-gradient(180deg, oklch(0.93 0.07 92), var(--gold) 45%, oklch(0.62 0.11 76));
        background-clip: text;
    }

    section {
        position: absolute;
    }

    .numbers {
        top: 166px;
        left: 48px;
        width: 504px;
    }

    .numbers dl {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 28px;
        margin-top: 12px;
    }

    .cell {
        min-width: 0;
        padding: 8px 0 6px;
        border-top: 2px solid var(--ink);
    }

    .cell dd {
        display: block;
        font-family: "Valve Pulp", sans-serif;
        font-size: calc(50px * var(--line-fit, 1));
        line-height: 1.04;
    }

    .cell dt {
        margin-top: 4px;
        font-size: calc(15px * var(--line-fit, 1));
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
    }

    .kda {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 2px solid var(--ink);
        font-size: calc(15px * var(--line-fit, 1));
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
    }

    .kda strong {
        margin-left: 10px;
        font-family: "Valve Pulp", sans-serif;
        font-size: 2em;
        letter-spacing: 0.02em;
        color: var(--ink);
    }

    .heroes {
        top: 166px;
        left: 648px;
        width: 504px;
    }

    .lead {
        display: flex;
        gap: 22px;
        margin-top: 14px;
    }

    .portrait {
        position: relative;
        flex: none;
        width: 112px;
        height: 150px;
        background: var(--black);
        box-shadow:
            0 0 0 2px var(--black),
            0 6px 14px oklch(0 0 0 / 0.28);
    }

    .portrait img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 15%;
    }

    .portrait.big {
        width: 190px;
        height: 254px;
        box-shadow:
            0 0 0 3px var(--gold-fill),
            0 0 0 6px var(--black),
            0 10px 24px oklch(0 0 0 / 0.32);
    }

    .medal {
        position: absolute;
        top: -14px;
        left: -14px;
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        font-family: "Valve Pulp", sans-serif;
        font-size: 30px;
        color: var(--black);
        background: radial-gradient(circle at 35% 30%, oklch(0.96 0.06 92), var(--gold) 45%, oklch(0.6 0.1 76));
        box-shadow: 0 0 0 3px var(--black);
    }

    .medal.small {
        top: -10px;
        left: -10px;
        width: 34px;
        height: 34px;
        font-size: 19px;
        background: var(--paper);
    }

    .lead-text {
        flex: 1;
        min-width: 0;
        padding-top: 16px;
    }

    .tag {
        display: inline-block;
        max-width: 100%;
        padding: 4px 10px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--gold);
        background: var(--black);
    }

    .hero-name {
        margin: 14px 0 10px;
        font-family: "Valve Pulp", sans-serif;
        font-size: calc(60px * var(--line-fit, 1));
        line-height: 1.04;
        text-transform: uppercase;
    }

    .hero-line {
        font-family: "Valve Oracle", serif;
        font-size: calc(24px * var(--line-fit, 1));
        font-weight: 500;
        line-height: 1.35;
        color: var(--ink-soft);
    }

    .others {
        display: grid;
        grid-template-columns: repeat(4, 112px);
        justify-content: space-between;
        margin: 30px 0 0 14px;
        list-style: none;
    }

    .others li {
        min-width: 0;
    }

    .mini-name {
        margin-top: 10px;
        font-size: calc(18px * var(--line-fit, 1));
        font-weight: 700;
        text-transform: uppercase;
    }

    .mini-line {
        font-size: calc(15px * var(--line-fit, 1));
        color: var(--ink-soft);
    }

    .side {
        top: 166px;
        left: 1248px;
        width: 504px;
    }

    .streak {
        display: flex;
        align-items: center;
        gap: 22px;
        padding-bottom: 12px;
        border-bottom: 2px solid var(--ink);
    }

    .streak-value {
        display: block;
        flex: none;
        max-width: 220px;
        font-family: "Valve Pulp", sans-serif;
        font-size: calc(120px * var(--line-fit, 1));
        line-height: 1.1;
        color: transparent;
        background: linear-gradient(180deg, oklch(0.72 0.12 84), var(--gold-ink));
        background-clip: text;
    }

    .streak-text {
        flex: 1;
        min-width: 0;
    }

    .streak-text h2 {
        font-size: calc(20px * var(--line-fit, 1));
    }

    .streak-line {
        margin-top: 6px;
        font-family: "Valve Oracle", serif;
        font-size: calc(36px * var(--line-fit, 1));
        font-style: italic;
        font-weight: 600;
        line-height: 1.25;
    }

    .goty {
        padding: 12px 0 10px;
        border-bottom: 2px solid var(--ink);
    }

    .goty-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 8px;
    }

    .goty-text {
        flex: 1;
        min-width: 0;
    }

    .thumb {
        flex: none;
        width: 54px;
        height: 72px;
        overflow: hidden;
        background: var(--black);
        box-shadow: 0 0 0 2px var(--gold-fill);
    }

    .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 15%;
    }

    .goty-hero {
        font-family: "Valve Pulp", sans-serif;
        font-size: calc(32px * var(--line-fit, 1));
        line-height: 1.15;
        text-transform: uppercase;
    }

    .goty-line {
        margin-top: 4px;
        font-family: "Valve Oracle", serif;
        font-size: calc(22px * var(--line-fit, 1));
        color: var(--ink-soft);
    }

    .goty-line strong {
        color: var(--gold-ink);
    }

    .people {
        padding-top: 12px;
    }

    .people ul {
        margin-top: 6px;
        list-style: none;
    }

    .people li,
    .nemesis {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        padding: 3px 0;
        border-bottom: 1px dashed oklch(0.2 0.01 80 / 0.35);
    }

    .who {
        display: block;
        min-width: 0;
        font-size: calc(22px * var(--line-fit, 1));
        font-weight: 700;
    }

    .what {
        flex: none;
        white-space: nowrap;
        font-family: "Valve Oracle", serif;
        font-size: 18px;
        color: var(--ink-soft);
    }

    .nem-head {
        margin-top: 10px;
    }

    .months {
        top: 706px;
        left: 48px;
        width: 1704px;
    }

    .months h2 span {
        letter-spacing: 0.14em;
        color: var(--ink-soft);
    }

    .months h2 .key {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 18px;
    }

    .key i {
        width: 14px;
        height: 14px;
        background: var(--gold-fill);
        box-shadow: 0 0 0 2px var(--black);
    }

    /* Twelve columns of 150 px: four to a panel, so every fold falls between two months. */
    .months ol {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        margin: 0 -48px;
        list-style: none;
    }

    .months li {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        height: 160px;
    }

    .count {
        margin-bottom: 6px;
        white-space: nowrap;
        font-size: 18px;
        font-weight: 700;
    }

    /* Black for the whole month, gold from the base for the games won. */
    .month-bar {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        width: 44px;
        background: var(--black);
    }

    .won {
        display: block;
        border-top: 2px solid var(--black);
        background: linear-gradient(90deg, oklch(0.62 0.11 78), oklch(0.86 0.09 90) 45%, var(--gold-fill));
    }

    .busiest .month-bar {
        outline: 3px solid var(--gold-fill);
        outline-offset: 3px;
    }

    .busiest .count {
        color: var(--gold-ink);
    }

    .month-label {
        width: 100%;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 3px solid var(--ink);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-align: center;
        text-transform: uppercase;
    }
</style>
