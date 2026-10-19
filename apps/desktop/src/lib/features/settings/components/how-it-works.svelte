<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";

    let { points }: { points: string[] } = $props();
</script>

<details class="group mt-1">
    <summary
        class="flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
        <ChevronRight class="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {t("settings.privacy.how_it_works")}
    </summary>
    <ul
        class="mt-2 ml-5 flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground marker:text-muted-foreground/50"
    >
        {#each points as point (point)}<li>{point}</li>{/each}
    </ul>
</details>
