<script lang="ts">
    import { Clock, Globe, HardDrive, PencilLine } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import type { MineStatus, RowStatus } from "$lib/features/builds/my-builds";

    let { status, waiting = false }: { status: RowStatus | MineStatus; waiting?: boolean } = $props();

    const place = $derived(status === "inGame" ? "local" : status === "published" ? "public" : status);
</script>

{#if place === "draft"}
    <Badge variant="secondary"><PencilLine aria-hidden="true" />{t("builds.mine.status.draft")}</Badge>
{:else if place === "local"}
    <Badge variant="outline"><HardDrive aria-hidden="true" />{t("builds.mine.status.local")}</Badge>
{:else if place === "public"}
    <Badge variant="success"><Globe aria-hidden="true" />{t("builds.mine.status.public")}</Badge>
{/if}
{#if waiting || place === "waiting"}
    <Badge variant="warning"><Clock aria-hidden="true" />{t("builds.mine.status.waiting")}</Badge>
{/if}
