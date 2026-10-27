<script lang="ts">
    import type { ChangelogEntry } from "../changelog";

    let { entries }: { entries: ChangelogEntry[] } = $props();
</script>

<div class="flex flex-col gap-4">
    {#each entries as entry (entry.version)}
        <div>
            <h3 class="font-heading text-sm font-semibold tracking-wide">
                {entry.version}
                {#if entry.date}<span class="font-normal text-muted-foreground">· {entry.date}</span>{/if}
            </h3>
            {#each entry.sections as section, i (i)}
                {#if section.title}
                    <h4 class="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{section.title}</h4>
                {/if}
                <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {#each section.items as item, j (j)}
                        <li>{item}</li>
                    {/each}
                </ul>
                {#each section.groups ?? [] as group, g (g)}
                    <h5 class="mt-2 text-xs font-semibold text-foreground">{group.title}</h5>
                    <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {#each group.items as item, j (j)}
                            <li>{item}</li>
                        {/each}
                    </ul>
                {/each}
            {/each}
        </div>
    {/each}
</div>
