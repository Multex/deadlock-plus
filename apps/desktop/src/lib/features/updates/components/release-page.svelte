<script lang="ts">
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import { textAround } from "$lib/core/text-around";
    import { releaseDay } from "../release-date";
    import { patchSections, type PatchHeading, type ReleaseStory } from "../release-story";

    let {
        story,
        featured = false,
    }: {
        story: ReleaseStory;
        /** The release the page opens on: it gets the marquee and the section index. */
        featured?: boolean;
    } = $props();

    const id = $props.id();
    const day = $derived(releaseDay(story.date));
    const sections = $derived(patchSections(story));
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
    const version = $derived(splitVersion(story.version));

    const KIND_LABEL = {
        added: "whats_new.section_general",
        changed: "whats_new.section_changes",
        fixed: "whats_new.section_fixes",
        removed: "whats_new.section_removed",
    } as const;

    function splitVersion(v: string): { major: string; minor: string } {
        const at = v.lastIndexOf(".");
        return at < 0 ? { major: v, minor: "" } : { major: v.slice(0, at), minor: v.slice(at) };
    }

    function title(heading: PatchHeading): string {
        if ("name" in heading) return heading.name;
        return heading.kind === "other" ? heading.title : t(KIND_LABEL[heading.kind]);
    }

    const numeral = (n: number) => String(n).padStart(2, "0");

    /** Moves focus with the scroll, so keyboard and screen reader users land where the index pointed. */
    function jump(sectionId: string) {
        const heading = document.getElementById(`${id}-${sectionId}-h`);
        if (!heading) return;
        const still = document.documentElement.hasAttribute("data-reduced-motion");
        heading.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        heading.focus({ preventScroll: true });
    }
</script>

<article class="release" class:featured aria-labelledby="{id}-version">
    {#if featured}
        <header class="stage">
            <div class="rays" aria-hidden="true"></div>
            <div class="ghost" aria-hidden="true">{version.major}</div>
            <h1 class="kicker rise" style="--d: 0">
                <span class="rule" aria-hidden="true"></span>{t("whats_new.title")}<span class="rule" aria-hidden="true"
                ></span>
            </h1>
            <h2 id="{id}-version" class="version rise" style="--d: 1">
                <span class="sr-only">{t("whats_new.version", { version: story.version })}</span>
                <span aria-hidden="true">{version.major}<span class="minor">{version.minor}</span></span>
            </h2>
            <div class="meta rise" style="--d: 2">
                {#if day}<p class="date">{formatDate(day, { dateStyle: "long" })}</p>{/if}
                {#if totals.length > 0}
                    <ul class="totals">
                        {#each totals as total (total.kind)}
                            <li>{total.before}<b>{total.n}</b>{total.after}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </header>
    {:else}
        <header class="band">
            <h2 id="{id}-version">{t("whats_new.version", { version: story.version })}</h2>
            {#if day}<p class="date">{formatDate(day, { dateStyle: "long" })}</p>{/if}
            {#if totals.length > 0}
                <ul class="totals">
                    {#each totals as total (total.kind)}
                        <li>{total.before}<b>{total.n}</b>{total.after}</li>
                    {/each}
                </ul>
            {/if}
        </header>
    {/if}

    <div class="layout">
        {#if featured && sections.length > 1}
            <nav class="index" aria-label={t("whats_new.index")}>
                <p class="index-title" aria-hidden="true">{t("whats_new.index")}</p>
                <ol>
                    {#each sections as section (section.id)}
                        <li>
                            <button type="button" class:is-feature={!!section.feature} onclick={() => jump(section.id)}>
                                {#if section.feature}
                                    <span class="index-num" aria-hidden="true">{numeral(section.feature.number)}</span>
                                {/if}
                                <span class="index-name">{title(section.heading)}</span>
                                <span class="index-count" aria-hidden="true">{section.count}</span>
                            </button>
                        </li>
                    {/each}
                </ol>
            </nav>
        {/if}

        <div class="notes">
            {#each sections as section (section.id)}
                {#if section.feature}
                    <section class="feature" class:lead-feature={featured && section.feature.number === 1}>
                        <header class="spot">
                            <span class="big-num" aria-hidden="true">{numeral(section.feature.number)}</span>
                            <div class="spot-text">
                                <h3 id="{id}-{section.id}-h" tabindex="-1">{title(section.heading)}</h3>
                                <p class="deck">{section.feature.deck}</p>
                            </div>
                        </header>
                        {#if section.lines.length > 0}
                            <ul class="lines">
                                {#each section.lines as line, j (j)}
                                    <li>{line}</li>
                                {/each}
                            </ul>
                        {/if}
                    </section>
                {:else}
                    <section class="plain">
                        <h3 id="{id}-{section.id}-h" tabindex="-1">
                            <span class="bracket" aria-hidden="true">[</span>{title(section.heading)}<span
                                class="bracket"
                                aria-hidden="true">]</span
                            >
                        </h3>
                        <ul class="lines">
                            {#each section.lines as line, j (j)}
                                <li>{line}</li>
                            {/each}
                        </ul>
                    </section>
                {/if}
            {/each}
        </div>
    </div>
</article>

<style>
    .release {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        color: var(--foreground);
    }

    /* The marquee the version stands in, lit from theme tokens so every theme draws it in its own colours. */
    .stage {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(6px, 1.4vh, 14px);
        min-height: clamp(240px, 52vh, 460px);
        padding: clamp(24px, 6vh, 56px) clamp(16px, 4cqi, 48px) clamp(20px, 4vh, 40px);
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
        font-size: clamp(160px, min(46cqi, 62vh), 480px);
        line-height: 0.8;
        color: transparent;
        -webkit-text-stroke: 1px color-mix(in oklch, var(--brass) 22%, transparent);
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
    }

    .kicker {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 0;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: clamp(12px, 1.4cqi, 15px);
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
        margin: 0;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: clamp(64px, min(16cqi, 22vh), 180px);
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

    .meta {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(6px, 1.4vh, 14px);
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
        margin: 0;
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
        padding: 0 16px;
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

    .band {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px 20px;
        margin: 0 clamp(16px, 4cqi, 48px);
        padding: 28px 0 12px;
        border-bottom: 2px solid color-mix(in oklch, var(--brass) 60%, transparent);
    }

    .band h2 {
        margin: 0;
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(24px, 3.2cqi, 34px);
        text-transform: uppercase;
    }

    .band .totals {
        justify-content: flex-start;
    }

    .band .totals li:first-child {
        padding-left: 0;
    }

    .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: clamp(20px, 3cqi, 40px);
        padding: clamp(16px, 3cqi, 32px) clamp(16px, 4cqi, 48px) clamp(16px, 3cqi, 32px);
    }

    .featured .layout {
        grid-template-columns: 260px minmax(0, 1fr);
        padding-bottom: 40px;
    }

    .index {
        position: sticky;
        top: 16px;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        padding: 14px 6px 10px 14px;
        border-left: 2px solid var(--brass);
        background: linear-gradient(to right, color-mix(in oklch, var(--brass) 8%, transparent), transparent);
    }

    .index-title {
        margin: 0 0 8px;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }

    .index ol {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .index button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 5px 8px 5px 0;
        border: 0;
        border-radius: 2px;
        background: none;
        color: var(--muted-foreground);
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.06em;
        text-align: left;
        text-transform: uppercase;
        transition: color 120ms;
    }

    .index button.is-feature {
        color: var(--foreground);
    }

    .index button:hover {
        color: var(--brass);
    }

    .index-num {
        flex: none;
        padding: 2px 5px;
        border-radius: 2px;
        background: var(--brass);
        color: var(--background);
        font-family: "Valve Pulp", sans-serif;
        font-size: 11px;
        letter-spacing: 0;
    }

    .index-name {
        flex: 1;
        min-width: 0;
    }

    .index-count {
        flex: none;
        font-family: "Valve Pulp", sans-serif;
        font-size: 12px;
        color: var(--brass);
    }

    .notes {
        display: flex;
        flex-direction: column;
        gap: clamp(22px, 3cqi, 34px);
        min-width: 0;
        max-width: 96ch;
    }

    .notes h3 {
        scroll-margin-top: 16px;
    }

    .notes h3:focus {
        outline: none;
    }

    .plain h3 {
        display: flex;
        align-items: baseline;
        gap: 0.4em;
        margin: 0 0 10px;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 700;
        font-size: 19px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .bracket {
        color: var(--brass);
        font-weight: 600;
    }

    .spot {
        display: flex;
        align-items: flex-start;
        gap: clamp(12px, 2cqi, 22px);
        padding: clamp(14px, 2.2cqi, 22px) clamp(14px, 2.4cqi, 26px);
        border: 1px solid color-mix(in oklch, var(--brass) 45%, transparent);
        border-radius: 6px;
        background:
            radial-gradient(
                ellipse 70% 120% at 0% 0%,
                color-mix(in oklch, var(--brass) 14%, transparent),
                transparent 70%
            ),
            color-mix(in oklch, var(--card) 88%, transparent);
        box-shadow:
            inset 0 1px 0 color-mix(in oklch, var(--brass) 30%, transparent),
            0 18px 36px -24px rgb(0 0 0 / 0.5);
    }

    .big-num {
        flex: none;
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(34px, 4.4cqi, 48px);
        line-height: 0.85;
        color: transparent;
        -webkit-text-stroke: 1.5px var(--brass);
    }

    .spot-text {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    .spot h3 {
        margin: 0;
        font-family: "Valve Oracle", var(--app-font);
        font-weight: 600;
        font-size: clamp(22px, 3cqi, 32px);
        line-height: 1.05;
    }

    .deck {
        margin: 0;
        font-size: clamp(15px, 1.6cqi, 18px);
        line-height: 1.4;
    }

    .lead-feature .spot {
        padding: clamp(18px, 3cqi, 32px) clamp(16px, 3cqi, 34px);
    }

    .lead-feature .big-num {
        font-size: clamp(44px, 6cqi, 72px);
    }

    .lead-feature .spot h3 {
        font-size: clamp(28px, 4.4cqi, 50px);
    }

    .lead-feature .deck {
        font-size: clamp(16px, 2cqi, 21px);
    }

    .lines {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 16px;
        line-height: 1.5;
    }

    .feature .lines {
        margin: 12px 0 0 clamp(4px, 1cqi, 12px);
        padding-left: clamp(10px, 1.6cqi, 18px);
        border-left: 1px solid color-mix(in oklch, var(--brass) 30%, transparent);
    }

    .lines li {
        position: relative;
        padding: 0 0 4px 20px;
    }

    .lines li::before {
        content: "-";
        position: absolute;
        left: 4px;
        color: var(--muted-foreground);
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

    /* Narrow: the index turns into chips above the notes, wrapping onto as many rows as the release needs. */
    @container (max-width: 760px) {
        .featured .layout {
            grid-template-columns: minmax(0, 1fr);
        }

        .index {
            position: static;
            max-height: none;
            overflow: visible;
            padding: 0;
            border: 0;
            background: none;
        }

        .index-title {
            display: none;
        }

        .index ol {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .index li {
            flex: none;
            max-width: 100%;
        }

        .index button {
            padding: 5px 10px 5px 6px;
            border: 1px solid color-mix(in oklch, var(--brass) 35%, transparent);
            background: color-mix(in oklch, var(--card) 80%, transparent);
            font-size: 12px;
        }

        .totals li {
            padding: 0 10px;
        }
    }

    /* Short windows (and 200% zoom): the marquee folds into one row so the notes start on the first screen. */
    @media (max-height: 520px) {
        .stage {
            display: grid;
            grid-template-columns: auto auto;
            grid-template-areas:
                "version kicker"
                "version meta";
            justify-content: center;
            align-items: center;
            gap: 4px 20px;
            min-height: 0;
            padding: 14px 16px 12px;
            text-align: left;
        }

        .ghost {
            display: none;
        }

        .kicker {
            grid-area: kicker;
            align-self: end;
        }

        .kicker .rule:first-child {
            display: none;
        }

        .version {
            grid-area: version;
            font-size: clamp(48px, 18vh, 72px);
        }

        .meta {
            grid-area: meta;
            align-self: start;
            align-items: flex-start;
            gap: 4px;
        }

        .stage .totals {
            justify-content: flex-start;
        }

        .stage .totals li:first-child {
            padding-left: 0;
        }

        .index {
            top: 8px;
        }
    }
</style>
