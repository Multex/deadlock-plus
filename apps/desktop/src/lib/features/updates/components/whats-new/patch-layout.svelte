<script lang="ts">
    import type { Snippet } from "svelte";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { releaseDay } from "../../release-date";
    import { patchSections, type PatchHeading, type ReleaseStory } from "../../release-story";

    let { story, actions }: { story: ReleaseStory; actions?: Snippet } = $props();

    const id = $props.id();
    const day = $derived(releaseDay(story.date));
    const sections = $derived(patchSections(story));

    const KIND_LABEL = {
        added: "whats_new.patch_general",
        changed: "whats_new.patch_changes",
        fixed: "whats_new.patch_fixes",
        removed: "whats_new.patch_removed",
    } as const;

    function title(heading: PatchHeading): string {
        if ("name" in heading) return heading.name;
        return heading.kind === "other" ? heading.title : t(KIND_LABEL[heading.kind]);
    }

    function jump(sectionId: string) {
        document.getElementById(`${id}-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
</script>

<article class="patch">
    <header class="banner">
        <div class="banner-art" aria-hidden="true"></div>
        <BrandMark class="brand" wordmark={false} />
        <h1>{t("whats_new.patch_title", { version: story.version })}</h1>
        {#if day}<p class="posted">{formatDate(day, { dateStyle: "long" })}</p>{/if}
    </header>

    <div class="layout">
        <nav class="index" aria-label={t("whats_new.patch_index")}>
            <h2>{t("whats_new.patch_index")}</h2>
            <ol>
                {#each sections as section (section.id)}
                    <li>
                        <button
                            type="button"
                            class:feature={"name" in section.heading}
                            onclick={() => jump(section.id)}
                        >
                            <span class="index-name">{title(section.heading)}</span>
                            <span class="index-count">{section.lines.length}</span>
                        </button>
                    </li>
                {/each}
            </ol>
        </nav>

        <div class="notes">
            {#each sections as section (section.id)}
                <section id="{id}-{section.id}" aria-labelledby="{id}-{section.id}-h">
                    <h3 id="{id}-{section.id}-h" class:feature={"name" in section.heading}>
                        <span class="bracket" aria-hidden="true">[</span>{title(section.heading)}<span
                            class="bracket"
                            aria-hidden="true">]</span
                        >
                    </h3>
                    <ul>
                        {#each section.lines as line, j (j)}
                            <li>{line}</li>
                        {/each}
                    </ul>
                </section>
            {/each}

            {#if actions}
                <footer class="actions">{@render actions()}</footer>
            {/if}
        </div>
    </div>
</article>

<style>
    .patch {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        color: var(--foreground);
        font-family: var(--game-font-sans, var(--app-font));
    }

    /* The game's update banners: a wide strip of title art with the post's title set in Valve Pulp over it. */
    .banner {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 6px;
        min-height: clamp(150px, 34vh, 280px);
        padding: clamp(16px, 3cqi, 36px) clamp(16px, 4cqi, 48px);
        border-bottom: 2px solid var(--brass);
        background: linear-gradient(to top, color-mix(in oklch, var(--background) 92%, transparent), transparent 75%);
    }

    .banner-art {
        position: absolute;
        inset: 0;
        z-index: -1;
        background:
            repeating-linear-gradient(
                -55deg,
                transparent 0 22px,
                color-mix(in oklch, var(--brass) 7%, transparent) 22px 23px
            ),
            radial-gradient(
                ellipse 50% 90% at 85% 30%,
                color-mix(in oklch, var(--brass) 30%, transparent),
                transparent 70%
            ),
            radial-gradient(
                ellipse 40% 70% at 10% 120%,
                color-mix(in oklch, var(--primary) 22%, transparent),
                transparent 70%
            ),
            var(--card);
    }

    .banner-art::after {
        content: "+";
        position: absolute;
        right: clamp(8px, 4cqi, 56px);
        top: 50%;
        translate: 0 -54%;
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(160px, min(30cqi, 52vh), 360px);
        line-height: 1;
        color: color-mix(in oklch, var(--brass) 16%, transparent);
    }

    .banner :global(.brand) {
        margin-bottom: auto;
        padding-bottom: 12px;
    }

    .banner :global(.brand img) {
        width: 34px;
        height: 34px;
    }

    .banner h1 {
        margin: 0;
        max-width: 18ch;
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: clamp(34px, 6.4cqi, 76px);
        line-height: 0.95;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        color: var(--foreground);
        text-shadow: 0 2px 18px rgb(0 0 0 / 0.35);
    }

    .posted {
        margin: 0;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 600;
        font-size: 14px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brass);
    }

    .layout {
        display: grid;
        grid-template-columns: 250px minmax(0, 1fr);
        align-items: start;
        gap: clamp(20px, 3cqi, 40px);
        padding: clamp(16px, 3cqi, 32px) clamp(16px, 4cqi, 48px) 40px;
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

    .index h2 {
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
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        width: 100%;
        padding: 5px 8px 5px 0;
        border: 0;
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

    .index button.feature {
        color: var(--foreground);
    }

    .index button:hover {
        color: var(--brass);
    }

    .index-count {
        font-family: "Valve Pulp", sans-serif;
        font-size: 12px;
        color: var(--brass);
    }

    .notes {
        display: flex;
        flex-direction: column;
        gap: clamp(20px, 3cqi, 30px);
        min-width: 0;
        max-width: 90ch;
    }

    .notes section {
        scroll-margin-top: 16px;
    }

    .notes h3 {
        display: flex;
        align-items: baseline;
        gap: 0.4em;
        margin: 0 0 10px;
        font-family: "Retail Demo", var(--app-font);
        font-weight: 700;
        font-size: 19px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--foreground);
    }

    .notes h3.feature {
        font-family: "Valve Pulp", sans-serif;
        font-size: clamp(22px, 2.6cqi, 28px);
        letter-spacing: 0.02em;
    }

    .bracket {
        color: var(--brass);
        font-weight: 600;
    }

    .notes ul {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 16px;
        line-height: 1.5;
    }

    .notes li {
        position: relative;
        padding: 0 0 4px 20px;
        color: var(--foreground);
    }

    .notes li::before {
        content: "-";
        position: absolute;
        left: 4px;
        color: var(--muted-foreground);
    }

    .actions {
        display: flex;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
    }

    @container (max-width: 760px) {
        .layout {
            grid-template-columns: minmax(0, 1fr);
        }

        .index {
            position: static;
            max-height: none;
        }

        .index ol {
            columns: 2 180px;
        }
    }
</style>
