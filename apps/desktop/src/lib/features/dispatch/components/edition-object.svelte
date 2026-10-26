<script lang="ts">
    import CollectorsEdition from "../kinds/collectors/collectors-edition.svelte";
    import MonthlyEdition from "../kinds/monthly/monthly-edition.svelte";
    import type { EditionObjectProps } from "../kinds/types";
    import WeeklyEdition from "../kinds/weekly/weekly-edition.svelte";
    import YearEndEdition from "../kinds/year_end/year-end-edition.svelte";

    let props: EditionObjectProps = $props();
</script>

{#if props.edition.window.kind === "monthly"}
    <MonthlyEdition {...props} />
{:else if props.edition.window.kind === "collectors"}
    <CollectorsEdition {...props} />
{:else if props.edition.window.kind === "year_end"}
    <YearEndEdition {...props} />
{:else}
    <WeeklyEdition {...props} />
{/if}
