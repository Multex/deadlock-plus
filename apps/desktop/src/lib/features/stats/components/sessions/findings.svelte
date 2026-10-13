<script lang="ts">
    import { tn } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { Finding, Tone } from "../../insights";

    let { findings, baseline }: { findings: Finding[]; baseline: number | null } = $props();

    const EDGE: Record<Tone, string> = {
        better: "border-l-primary",
        worse: "border-l-destructive",
        same: "border-l-border",
        unknown: "border-l-border",
    };
    const FILL: Record<Tone, string> = {
        better: "bg-primary",
        worse: "bg-destructive",
        same: "bg-muted-foreground/50",
        unknown: "bg-muted-foreground/25",
    };
</script>

<div class="grid gap-3 md:grid-cols-2">
    {#each findings as f (f.id)}
        <Card as="article" class="flex flex-col gap-3 border-l-4 {EDGE[f.tone]}">
            <div>
                <h3 class="text-base">{f.title}</h3>
                <p class="mt-1 text-sm {f.tone === 'unknown' ? 'text-muted-foreground' : ''}">{f.headline}</p>
            </div>
            <ul class="mt-auto flex flex-col gap-1.5">
                {#each f.bars as b (b.label)}
                    <li class="grid grid-cols-[8.5rem_1fr_auto] items-center gap-2 text-xs">
                        <span class="truncate text-muted-foreground">{b.label}</span>
                        <div class="relative h-2 overflow-hidden rounded-full bg-muted">
                            {#if b.winrate !== null}
                                <div class="h-full rounded-full {FILL[b.tone]}" style:width="{b.winrate * 100}%"></div>
                            {/if}
                            {#if baseline !== null}
                                <div
                                    class="absolute inset-y-0 w-0.5 bg-foreground/70"
                                    style:left="{baseline * 100}%"
                                ></div>
                            {/if}
                        </div>
                        <span class="w-28 text-right tabular-nums">
                            {b.winrate === null ? "-" : `${Math.round(b.winrate * 100)}%`}
                            <span class="text-muted-foreground">
                                · {tn("sessions.findings.games", b.games)}{b.note ? ` · ${b.note}` : ""}
                            </span>
                        </span>
                    </li>
                {/each}
            </ul>
        </Card>
    {/each}
</div>
