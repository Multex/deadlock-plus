<script lang="ts">
    import { toast } from "svelte-sonner";
    import { openWithDeeplink } from "$lib/core/deeplink";
    import { errorText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { ExternalLink } from "@lucide/svelte";

    import Badge from "$lib/ui/badge.svelte";
    import Button from "$lib/ui/button.svelte";
    import * as Dialog from "$lib/ui/dialog";
    import EmptyState from "$lib/ui/empty-state.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { formatPublished, safeExternalUrl, sourceLabel } from "$lib/features/alerts/alerts";
    import { getPatchNotes } from "$lib/features/patch-notes/api";
    import {
        contentState,
        groupByBullet,
        groupBySection,
        groupBySubject,
        imageMarkerIndex,
        renderInline,
        type PatchDetail,
    } from "$lib/features/patch-notes/patch-notes";

    let {
        open = $bindable(false),
        patchId,
        title,
        published,
        origin,
        link,
    }: {
        open?: boolean;
        patchId: string | null;
        title: string;
        published: string;
        origin: string;
        link: string;
    } = $props();

    let detail = $state<PatchDetail | null>(null);
    let loading = $state(false);
    let error = $state<string | null>(null);
    let brokenImages = $state<Set<string>>(new Set());
    let expandedImage = $state<string | null>(null);
    let generation = 0;

    const date = $derived(formatPublished(published));
    const viewState = $derived(detail ? contentState(detail.lines, detail.origin) : "empty");
    // A patch with exactly one, never-headed section is prose that never had a real `[ Section ]`
    // header of its own (see `parse::parse_body`'s default) — labelling it "GENERAL" would be noise.
    const sections = $derived(detail && viewState !== "empty" ? groupBySection(detail.lines) : []);
    const showSectionHeadings = $derived(sections.length > 1 || sections[0]?.name !== "General");

    // Resolves a line's `raw` to the image it names, at the position it actually held in the
    // body (see `bbcode::strip_bbcode`'s marker), instead of every image being grouped at the top
    // of the post regardless of where it sat.
    function imageSrc(raw: string): string | null {
        const idx = imageMarkerIndex(raw);
        const src = idx === null ? undefined : detail?.images[idx];
        return src && !brokenImages.has(src) ? src : null;
    }

    // A patch indexed before markers existed has real URLs in `images` but no line pointing at
    // any of them — the position they held in the body was already lost by the time they were
    // first parsed, and no later fix can recover it. Falling back to showing them up top, like
    // before this change, beats silently dropping them; a patch only ever needs this until Steam
    // republishes a fuller body and it gets re-parsed with a real marker.
    const referencedImages = $derived(
        new Set((detail?.lines ?? []).map((l) => imageMarkerIndex(l.raw)).filter((idx): idx is number => idx !== null)),
    );
    const orphanImages = $derived(
        (detail?.images ?? []).filter((src, idx) => !referencedImages.has(idx) && !brokenImages.has(src)),
    );

    $effect(() => {
        if (open && patchId) void load(patchId);
        else {
            detail = null;
            error = null;
        }
        expandedImage = null;
    });

    async function load(id: string) {
        const mine = ++generation;
        loading = true;
        error = null;
        try {
            const found = await getPatchNotes(id);
            if (mine === generation) detail = found;
        } catch (e) {
            if (mine === generation) error = errorText(e);
        } finally {
            if (mine === generation) loading = false;
        }
    }

    let expandOrigin: HTMLElement | null = null;

    function expand(src: string, origin: HTMLElement) {
        expandOrigin = origin;
        expandedImage = src;
    }

    function collapse() {
        expandedImage = null;
        expandOrigin?.focus();
    }

    function focusOnMount(node: HTMLElement) {
        node.focus();
    }

    function openExternal() {
        const url = safeExternalUrl(link);
        if (!url) return toast.error(t("patch_notes.no_link"));
        openWithDeeplink(url).catch((e) => toast.error(t("patch_notes.open_link_error", { error: String(e) })));
    }

    // The trailing space lives inside the string, not the template: a line-wrapped `<span>...
    // </span>` puts a newline-only text node between the colon and the next value, and Svelte
    // drops that node entirely rather than collapsing it to a space.
    function subjectPrefix(subject: string | null) {
        return subject ? `${subject}: ` : "";
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="h-[80%] max-w-3xl">
        <div class="flex flex-col gap-1.5 border-b border-border pb-4">
            <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{sourceLabel(origin)}</Badge>
                {#if date}<span class="text-sm text-muted-foreground">{date}</span>{/if}
            </div>
            <Dialog.Title class="font-heading text-2xl font-semibold leading-tight tracking-wide">{title}</Dialog.Title>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            {#if loading}
                <EmptyState size="base" spacing="sm">{t("patch_notes.loading")}</EmptyState>
            {:else if error}
                <EmptyState size="base" spacing="sm" tone="destructive">
                    {t("patch_notes.load_error", { error })}
                </EmptyState>
            {:else if viewState === "empty"}
                <EmptyState size="base" spacing="sm">{t("patch_notes.not_indexed")}</EmptyState>
            {:else}
                {#if viewState === "shallow"}
                    <div
                        class="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                    >
                        <span>{t("patch_notes.shallow_notice")}</span>
                        <Button variant="link" class="h-auto p-0" onclick={openExternal}>
                            {t("patch_notes.read_full", { source: sourceLabel(origin) })}
                        </Button>
                    </div>
                {/if}
                {#if orphanImages.length > 0}
                    <div class="mb-5 flex flex-col gap-3">
                        {#each orphanImages as src (src)}
                            <button
                                type="button"
                                class="cursor-zoom-in overflow-hidden rounded-lg border border-border bg-background text-left"
                                aria-label={t("patch_notes.expand_image")}
                                onclick={(e) => expand(src, e.currentTarget)}
                            >
                                <img
                                    {src}
                                    alt=""
                                    loading="lazy"
                                    class="max-h-96 w-full object-contain"
                                    onerror={() => (brokenImages = new Set(brokenImages).add(src))}
                                />
                            </button>
                        {/each}
                    </div>
                {/if}
                <div class="flex flex-col gap-6">
                    {#each sections as section (section.name + section.lines[0].raw)}
                        <section class="flex flex-col gap-3">
                            {#if showSectionHeadings}
                                <h3 class="font-heading text-sm font-semibold uppercase tracking-[0.15em] text-brass">
                                    {section.name}
                                </h3>
                            {/if}
                            {#each groupByBullet(section.lines) as run, r (r)}
                                {#if run.bullet}
                                    <ul class="flex flex-col gap-2.5 border-l-2 border-border pl-4">
                                        {#each groupBySubject(run.lines) as group, i (i)}
                                            <li class="flex gap-2.5 text-base leading-relaxed text-foreground/90">
                                                <span
                                                    class="mt-2.5 size-1 shrink-0 rounded-full bg-brass/70"
                                                    aria-hidden="true"
                                                ></span>
                                                <div class="flex-1">
                                                    {#if group.items.length === 1}
                                                        {#if group.subject}<span class="font-semibold text-foreground"
                                                                >{@html renderInline(
                                                                    subjectPrefix(group.subject),
                                                                )}</span
                                                            >{/if}{@html renderInline(group.items[0])}
                                                    {:else}
                                                        {#if group.subject}<span class="font-semibold text-foreground"
                                                                >{@html renderInline(group.subject)}</span
                                                            >{/if}
                                                        <ul class="mt-1.5 flex flex-col gap-1.5">
                                                            {#each group.items as item, j (j)}
                                                                <li class="flex gap-2">
                                                                    <span
                                                                        class="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50"
                                                                        aria-hidden="true"
                                                                    ></span>
                                                                    <span>{@html renderInline(item)}</span>
                                                                </li>
                                                            {/each}
                                                        </ul>
                                                    {/if}
                                                </div>
                                            </li>
                                        {/each}
                                    </ul>
                                {:else}
                                    <div class="flex flex-col gap-3">
                                        {#each run.lines as line, i (i)}
                                            {@const src = imageSrc(line.raw)}
                                            {#if src}
                                                <button
                                                    type="button"
                                                    class="cursor-zoom-in overflow-hidden rounded-lg border border-border bg-background text-left"
                                                    aria-label={t("patch_notes.expand_image")}
                                                    onclick={(e) => expand(src, e.currentTarget)}
                                                >
                                                    <img
                                                        {src}
                                                        alt=""
                                                        loading="lazy"
                                                        class="max-h-96 w-full object-contain"
                                                        onerror={() => (brokenImages = new Set(brokenImages).add(src))}
                                                    />
                                                </button>
                                            {:else}
                                                <p class="text-base leading-relaxed text-foreground/90">
                                                    {@html renderInline(line.raw)}
                                                </p>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}
                            {/each}
                        </section>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="flex justify-end gap-2 border-t border-border pt-4">
            <SupportButton size="default" class="mr-auto" />
            <Button variant="outline" onclick={() => (open = false)}>{t("patch_notes.close")}</Button>
            <Button onclick={openExternal}>
                {t("patch_notes.view_on", { source: sourceLabel(origin) })}
                <ExternalLink class="size-4" />
            </Button>
        </div>

        {#if expandedImage}
            <!-- Absolute, not fixed: `Dialog.Content` is itself translated for centering, which makes
                 it the containing block for a fixed descendant too, so `fixed` would end up scoped to
                 it anyway — `absolute` says that plainly instead of relying on the accident. -->
            <button
                type="button"
                class="absolute inset-0 z-(--z-local) flex cursor-zoom-out items-center justify-center bg-background/95 p-6"
                use:focusOnMount
                onclick={collapse}
                aria-label={t("patch_notes.close_image")}
            >
                <img src={expandedImage} alt="" class="max-h-full max-w-full rounded-lg object-contain" />
            </button>
        {/if}
    </Dialog.Content>
</Dialog.Root>
