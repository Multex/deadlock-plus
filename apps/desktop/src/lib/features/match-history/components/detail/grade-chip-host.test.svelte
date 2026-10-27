<script lang="ts">
    import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import GradeChip from "./grade-chip.svelte";

    let { grade }: { grade: MvpPlayerGrade } = $props();
</script>

<Tooltip.Provider>
    <GradeChip {grade} />
</Tooltip.Provider>
