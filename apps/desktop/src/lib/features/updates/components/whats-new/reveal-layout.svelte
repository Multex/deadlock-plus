<script lang="ts">
    import type { Snippet } from "svelte";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import { textAround } from "$lib/core/text-around";
    import { releaseDay } from "../../release-date";
    import type { Brief, ReleaseStory } from "../../release-story";

    let { story, actions }: { story: ReleaseStory; actions?: Snippet } = $props();

    const id = $props.id();
    const day = $derived(releaseDay(story.date));
    const totals = $derived(
        (["added", "changed", "fixed"] as const)
            .filter((kind) => story.counts[kind] > 0)
            .map((kind) => {
                const [before, after] = textAround((v) =>
                    tn(`whats_new.count_${kind}`, story.counts[kind], { count: v }),
                );
                return { kind, before, after, n: story.counts[kind] };
            }),
    );
    const [major, minor = ""] = $derived(splitVersion(story.version));

    function splitVersion(version: string): [string, string] {
        const at = version.lastIndexOf(".");
        return at < 0 ? [version, ""] : [version.slice(0, at), version.slice(at)];
    }

    function label(brief: Brief): string {
        return brief.kind === "other" ? brief.title : t(`whats_new.section_${brief.kind}`);
    }

    function jump(i: number) {
        document.getElementById(`${id}-h${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const numeral = (i: number) => String(i + 1).padStart(2, "0");
</script>

<article class="reveal">
    <header class="stage">
        <div class="rays" aria-hidden="true"></div>
        <div class="ghost" aria-hidden="true">{major}</div>

        <p class="kicker rise" style="--d: 0">
            <span class="rule"></span>{t("whats_new.kicker")}<span class="rule"></span>
        </p>
        <h1 class="version rise" style="--d: 1">
            <span>{major}</span><span class="minor">{minor}</span>
        </h1>
        {#if day}
            <p class="date rise" style="--d: 2">{formatDate(day, { dateStyle: "long" })}</p>
        {/if}

        {#if totals.length > 0}
            <ul class="totals rise" style="--d: 3">
                {#each totals as total (total.kind)}
                    <li class="total-{total.kind}">
                        {total.before}<b>{total.n}</b>{total.after}
                    </li>
                {/each}
            </ul>
        {/if}

        {#if story.headlines.length > 0}
            <nav class="plaques rise" style="--d: 4" aria-label={t("whats_new.headlines")}>
                {#each story.headlines as headline, i (i)}
                    <button type="button" onclick={() => jump(i)}>
                        <span class="num">{numeral(i)}</span>
                        <span class="name">{headline.title}</span>
                    </button>
                {/each}
            </nav>
        {/if}
    </header>

    {#each story.headlines as headline, i (i)}
        <section class="spotlight" class:first={i === 0} id="{id}-h{i}" aria-labelledby="{id}-t{i}">
            <div class="intro">
                <span class="big-num" aria-hidden="true">{numeral(i)}</span>
                <h2 id="{id}-t{i}">{headline.title}</h2>
                <p class="lead">{headline.lead}</p>
            </div>
            {#if headline.points.length > 0}
                <ul class="points">
                    {#each headline.points as point, j (j)}
                        <li>{point}</li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/each}

    {#if story.briefs.length > 0}
        <section class="also">
            <h2 class="also-head"><span class="rule"></span>{t("whats_new.also")}<span class="rule"></span></h2>
            <div class="columns">
                {#each story.briefs as brief (brief.title)}
                    <div class="column kind-{brief.kind}">
                        <h3>{label(brief)}</h3>
                        {#if brief.items.length > 0}
                            <ul>
                                {#each brief.items as item, j (j)}
                                    <li>{item}</li>
                                {/each}
                            </ul>
                        {/if}
                        {#each brief.groups as group (group.title)}
                            <h4>{group.title}</h4>
                            <ul>
                                {#each group.items as item, j (j)}
                                    <li>{item}</li>
                                {/each}
                            </ul>
                        {/each}
                    </div>
                {/each}
            </div>
        </section>
    {/if}

    {#if actions}
        <footer class="actions">{@render actions()}</footer>
    {/if}
</article>

<style>
    .reveal {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        gap: clamp(28px, 5cqi, 56px);
        padding-bottom: 40px;
        color: var(--foreground);
    }

    /* The stage: a spotlit marquee the version stands in, drawn from theme tokens so every theme lights it. */
    .stage {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(6px, 1.4vh, 14px);
        min-height: clamp(240px, 64vh, 560px);
        padding: clamp(24px, 6vh, 64px) clamp(16px, 4cqi, 48px) clamp(20px, 4vh, 40px);
        text-align: center;
        background:
            radial-gradient(
                ellipse 60% 70% at 50% 0%,
                color-mix(in oklch, var(--brass) 26%, transparent),
                transparent 70%
            ),
            radial-gradient(
                ellipse 90% 60% at 50% 110%,
                color-mix(in oklch, var(--primary) 14%, transparent),
                transparent 70%
            ),
            linear-gradient(to bottom, color-mix(in oklch, var(--card) 70%, transparent), transparent);
        border-bottom: 1px solid color-mix(in oklch, var(--brass) 40%, transparent);
    }

    .stage::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: -1px;
        width: min(420px, 50%);
        height: 2px;
        translate: -50% 0;
        background: linear-gradient(to right, transparent, var(--brass), transparent);
    }

    .rays {
        position: absolute;
        inset: -40% -10% 0;
        z-index: -1;
        background: repeating-conic-gradient(
            from 0deg at 50% 0%,
            color-mix(in oklch, var(--brass) 9%, transparent) 0deg 3deg,
            transparent 3deg 9deg
        );
        mask-image: radial-gradient(ellipse 55% 75% at 50% 0%, #000 0%, transparent 75%);
    }

    .ghost {
        position: absolute;
        inset: 50% 0 auto;
        z-index: -1;
        translate: 0 -46%;
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(160px, min(46cqi, 70vh), 520px);
        line-height: 0.8;
        color: transparent;
        -webkit-text-stroke: 1px color-mix(in oklch, var(--brass) 22%, transparent);
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
    }

    .kicker,
    .also-head {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 0;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: clamp(11px, 1.3cqi, 14px);
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .rule {
        width: clamp(24px, 6cqi, 72px);
        height: 1px;
        background: linear-gradient(to right, transparent, currentColor);
    }

    .rule:last-child {
        background: linear-gradient(to left, transparent, currentColor);
    }

    .version {
        display: flex;
        align-items: baseline;
        margin: 0;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: clamp(64px, min(16cqi, 24vh), 188px);
        line-height: 0.86;
        letter-spacing: -0.02em;
        color: var(--foreground);
        text-shadow:
            0 2px 0 color-mix(in oklch, var(--brass) 55%, transparent),
            0 18px 48px color-mix(in oklch, var(--brass) 30%, transparent);
    }

    .minor {
        color: var(--brass);
    }

    .date {
        margin: 0;
        font-family: "Valve Oracle", var(--app-font);
        font-weight: 500;
        font-style: italic;
        font-size: clamp(14px, 1.6cqi, 18px);
        color: var(--muted-foreground);
    }

    .totals {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px 0;
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: clamp(12px, 1.3cqi, 14px);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }

    .totals li {
        display: flex;
        align-items: baseline;
        gap: 6px;
        padding: 0 18px;
    }

    .totals li + li {
        border-left: 1px solid color-mix(in oklch, var(--brass) 35%, transparent);
    }

    .totals b {
        font-family: "Valve Pulp", sans-serif;
        font-size: 1.7em;
        letter-spacing: 0;
        color: var(--foreground);
    }

    .plaques {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        max-width: 980px;
        margin-top: clamp(4px, 2vh, 18px);
    }

    .plaques button {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 14px 7px 8px;
        border: 1px solid color-mix(in oklch, var(--brass) 35%, transparent);
        border-radius: 3px;
        background: color-mix(in oklch, var(--card) 80%, transparent);
        color: var(--foreground);
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        transition:
            border-color 120ms,
            background-color 120ms,
            translate 120ms;
    }

    .plaques button:hover {
        border-color: var(--brass);
        background: color-mix(in oklch, var(--brass) 12%, var(--card));
        translate: 0 -1px;
    }

    .plaques .num {
        padding: 2px 5px;
        border-radius: 2px;
        background: var(--brass);
        color: var(--background);
        font-family: "Valve Pulp", sans-serif;
        font-size: 12px;
        letter-spacing: 0;
    }

    .spotlight {
        display: grid;
        grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
        gap: clamp(16px, 4cqi, 56px);
        margin: 0 clamp(16px, 5cqi, 64px);
        padding: clamp(18px, 3cqi, 36px) 0 0;
        border-top: 1px solid var(--border);
        scroll-margin-top: 16px;
    }

    .spotlight.first {
        grid-template-columns: minmax(0, 1fr);
        padding: clamp(20px, 3.4cqi, 40px);
        border: 1px solid color-mix(in oklch, var(--brass) 45%, transparent);
        border-radius: 6px;
        background:
            radial-gradient(
                ellipse 70% 90% at 0% 0%,
                color-mix(in oklch, var(--brass) 14%, transparent),
                transparent 70%
            ),
            color-mix(in oklch, var(--card) 88%, transparent);
        box-shadow:
            inset 0 1px 0 color-mix(in oklch, var(--brass) 30%, transparent),
            0 24px 48px -24px rgb(0 0 0 / 0.5);
    }

    .intro {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
    }

    .big-num {
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(36px, 5cqi, 56px);
        line-height: 0.8;
        color: transparent;
        -webkit-text-stroke: 1.5px var(--brass);
    }

    .spotlight h2 {
        margin: 0;
        font-family: "Valve Oracle", var(--app-font);
        font-weight: 600;
        font-size: clamp(26px, 3.6cqi, 40px);
        line-height: 1.05;
        letter-spacing: 0.01em;
    }

    .first h2 {
        font-size: clamp(32px, 5.4cqi, 60px);
    }

    .lead {
        margin: 0;
        max-width: 60ch;
        font-size: clamp(16px, 1.7cqi, 19px);
        line-height: 1.45;
        color: var(--foreground);
    }

    .first .lead {
        font-size: clamp(17px, 2cqi, 22px);
    }

    .points {
        margin: 0;
        padding: 0;
        list-style: none;
        columns: 2 280px;
        column-gap: clamp(20px, 3cqi, 40px);
        font-size: 15px;
        line-height: 1.45;
        color: var(--muted-foreground);
    }

    .first .points {
        margin-top: clamp(14px, 2.4cqi, 28px);
        padding-top: clamp(14px, 2.4cqi, 28px);
        border-top: 1px solid color-mix(in oklch, var(--brass) 25%, transparent);
        columns: 3 240px;
    }

    .points li,
    .column li {
        position: relative;
        break-inside: avoid;
        padding: 0 0 8px 18px;
    }

    .points li::before,
    .column li::before {
        content: "";
        position: absolute;
        left: 2px;
        top: 0.55em;
        width: 6px;
        height: 6px;
        rotate: 45deg;
        background: color-mix(in oklch, var(--brass) 75%, transparent);
    }

    .also {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(16px, 3cqi, 28px);
        margin: 0 clamp(16px, 5cqi, 64px);
    }

    .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        width: 100%;
    }

    .column {
        padding: 18px 20px 12px;
        border: 1px solid var(--border);
        border-top: 3px solid var(--brass);
        border-radius: 4px;
        background: color-mix(in oklch, var(--card) 85%, transparent);
        font-size: 14px;
        line-height: 1.45;
        color: var(--muted-foreground);
    }

    .kind-changed {
        border-top-color: color-mix(in oklch, var(--brass) 55%, var(--foreground));
    }

    .kind-fixed {
        border-top-color: var(--success);
    }

    .column h3 {
        margin: 0 0 12px;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--foreground);
    }

    .column h4 {
        margin: 8px 0 8px;
        font-family: "Valve Oracle", var(--app-font);
        font-weight: 600;
        font-size: 15px;
        color: var(--foreground);
    }

    .column ul {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin: 0 clamp(16px, 5cqi, 64px);
    }

    .rise {
        animation: rise 640ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        animation-delay: calc(var(--d) * 110ms + 80ms);
    }

    @keyframes rise {
        from {
            opacity: 0;
            translate: 0 14px;
        }
    }

    @container (max-width: 720px) {
        .spotlight {
            grid-template-columns: minmax(0, 1fr);
        }

        .totals li {
            padding: 0 10px;
        }

        .plaques button {
            padding: 5px 10px 5px 6px;
            font-size: 12px;
        }
    }
</style>
