<script lang="ts">
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import type { EditionView } from "../../edition-view";
    import { useYearEnd } from "./year-end-data.svelte";
    import YearEndCover from "./year-end-cover.svelte";

    /** The closed Year-End cover on its own, at its print size: what "Front page" exports for this kind. */
    let { edition, view }: { edition: Edition; view: EditionView } = $props();

    const data = useYearEnd(
        () => edition,
        () => view,
    );
</script>

<YearEndCover cover={data.view.cover} backdrop={data.backdrop} portrait={data.portrait} />
