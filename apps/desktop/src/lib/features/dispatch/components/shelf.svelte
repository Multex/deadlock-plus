<script lang="ts">
    import { LoaderCircle, Printer } from "@lucide/svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import Button, { unstyledButtonClass } from "@deadlock-plus/ui/button.svelte";
    import type { EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
    import type { ShelfEntry } from "../dispatch.svelte";

    let {
        shelf,
        selected,
        unseen,
        label,
        onopen,
        onprint,
    }: {
        shelf: { weekly: ShelfEntry[]; monthly: ShelfEntry[] };
        selected: string | null;
        unseen: readonly string[];
        label: (window: EditionWindow) => string;
        onopen: (id: string) => void;
        /** Resolves once the printed edition is open, or the print gave up. */
        onprint: (window: EditionWindow) => Promise<void>;
    } = $props();

    const SHOWN = 8;
    const KINDS: readonly EditionKind[] = ["weekly", "monthly"];

    let printing = $state<string | null>(null);
    let expanded = $state<Record<EditionKind, boolean>>({ weekly: false, monthly: false });

    async function print(window: EditionWindow) {
        if (printing) return;
        printing = window.id;
        try {
            await onprint(window);
        } finally {
            printing = null;
        }
    }
</script>

<div class="flex flex-col gap-6">
    {#each KINDS as kind (kind)}
        {@const entries = shelf[kind]}
        {#if entries.length > 0}
            {@const shown = expanded[kind] ? entries : entries.slice(0, SHOWN)}
            <section class="flex flex-col gap-3" aria-labelledby="shelf-{kind}">
                <h2 id="shelf-{kind}" class="text-lg">{t(`dispatch.shelf.${kind}`)}</h2>
                <ul class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                    {#each shown as entry (entry.window.id)}
                        {@const id = entry.window.id}
                        <li class="min-w-0">
                            {#if entry.status === "issued"}
                                <button
                                    type="button"
                                    class="{unstyledButtonClass} flex h-full w-full flex-col gap-0.5 rounded-md border px-3 py-2 hover:border-brass/50 hover:bg-accent {selected ===
                                    id
                                        ? 'border-brass/70 bg-brass/10 shadow-[inset_0_-2px_0_var(--brass)]'
                                        : 'border-border bg-card'}"
                                    aria-current={selected === id ? "true" : undefined}
                                    onclick={() => onopen(id)}
                                >
                                    <span class="truncate text-sm font-medium">{label(entry.window)}</span>
                                    <span class="flex items-center gap-2 text-xs text-muted-foreground">
                                        {#if entry.number !== null}
                                            {t("dispatch.shelf.number", { number: entry.number })}
                                        {/if}
                                        {#if unseen.includes(id)}
                                            <span class="font-semibold text-brass">{t("dispatch.shelf.new")}</span>
                                        {/if}
                                    </span>
                                </button>
                            {:else if entry.status === "printable"}
                                <div
                                    class="flex h-full flex-col gap-1.5 rounded-md border border-dashed border-border px-3 py-2"
                                >
                                    <span class="flex flex-col gap-0.5">
                                        <span class="truncate text-sm font-medium">{label(entry.window)}</span>
                                        <span class="truncate text-xs text-muted-foreground">
                                            {tn("dispatch.shelf.matches", entry.matches)}
                                        </span>
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="self-start"
                                        disabled={printing !== null}
                                        onclick={() => print(entry.window)}
                                    >
                                        {#if printing === id}
                                            <LoaderCircle class="animate-spin" aria-hidden="true" />
                                            {t("dispatch.shelf.printing")}
                                        {:else}
                                            <Printer aria-hidden="true" />
                                            {t("dispatch.shelf.print")}
                                        {/if}
                                    </Button>
                                </div>
                            {:else}
                                <div
                                    class="flex h-full flex-col gap-0.5 rounded-md border border-border/50 px-3 py-2 text-muted-foreground opacity-70"
                                >
                                    <span class="truncate text-sm">{label(entry.window)}</span>
                                    <span class="text-xs">{tn("dispatch.shelf.too_few", entry.matches)}</span>
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
                {#if entries.length > SHOWN}
                    <Button
                        variant="ghost"
                        size="sm"
                        class="self-start"
                        onclick={() => (expanded = { ...expanded, [kind]: !expanded[kind] })}
                    >
                        {expanded[kind]
                            ? t("dispatch.shelf.show_fewer")
                            : tn(`dispatch.shelf.show_older_${kind}`, entries.length - SHOWN)}
                    </Button>
                {/if}
            </section>
        {/if}
    {/each}
</div>
