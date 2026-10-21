<script lang="ts">
    import { Clock, Gamepad2, Globe, PencilLine } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import type { MineStatus } from "$lib/features/builds/my-builds";

    let { status }: { status: MineStatus } = $props();
</script>

{#if status === "draft"}
    <Badge variant="secondary"><PencilLine aria-hidden="true" />{t("builds.mine.status.draft")}</Badge>
{:else if status === "waiting"}
    <Badge variant="warning"><Clock aria-hidden="true" />{t("builds.mine.status.waiting")}</Badge>
{:else if status === "inGame"}
    <Badge variant="success"><Gamepad2 aria-hidden="true" />{t("builds.mine.status.in_game")}</Badge>
{:else}
    <Badge variant="outline"><Globe aria-hidden="true" />{t("builds.mine.status.published")}</Badge>
{/if}
