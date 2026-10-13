<script lang="ts">
    import { toast } from "svelte-sonner";
    import { Copy, ImageDown } from "@lucide/svelte";

    import { errorText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { loadHeroes } from "$lib/features/heroes/heroes";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { findPlayer, type MatchDetail } from "@deadlock-plus/match/detail";
    import { exportFileName, runExport, type ExportKind } from "@deadlock-plus/match/export";
    import { copyImage, documentHasFocus, renderNodeToPng, saveImage, waitForWindowFocus } from "../../export-dom";

    let { node, detail, ownAccountId }: { node: HTMLElement | null; detail: MatchDetail; ownAccountId: number | null } =
        $props();

    let busy = $state<ExportKind | null>(null);

    async function fileName(): Promise<string> {
        const own = ownAccountId === null ? undefined : findPlayer(detail, [ownAccountId]);
        const heroes = own ? await loadHeroes([own.heroId]).catch(() => null) : null;
        const heroName = own ? (heroes?.[own.heroId]?.name ?? null) : null;
        const outcome = own?.outcome === "win" || own?.outcome === "loss" ? own.outcome : null;
        return exportFileName({ heroName, outcome, matchId: detail.matchId, date: new Date(detail.startTime * 1000) });
    }

    async function run(kind: ExportKind) {
        if (!node || busy) return;
        busy = kind;
        try {
            const target = node;
            const result = await runExport(kind, await fileName(), {
                render: () => renderNodeToPng(target, t("match_history.detail.export.made_with")),
                save: saveImage,
                copy: copyImage,
                hasFocus: documentHasFocus,
                waitForFocus: waitForWindowFocus,
            });
            if (result.status === "saved") toast.success(t("match_history.detail.export.saved"));
            else if (result.status === "copied") toast.success(t("match_history.detail.export.copied"));
            else if (result.status === "failed") {
                const error = errorText(result.error);
                toast.error(
                    kind === "copy"
                        ? t("match_history.detail.export.copy_failed", { error })
                        : t("match_history.detail.export.save_failed", { error }),
                );
            }
        } finally {
            busy = null;
        }
    }
</script>

<div
    class="flex flex-wrap items-center gap-2"
    data-export-ignore
    role="group"
    aria-label={t("match_history.detail.export.group")}
>
    <Button variant="outline" size="sm" onclick={() => run("save")} disabled={!node || busy !== null}>
        <ImageDown />
        {busy === "save" ? t("match_history.detail.export.working") : t("match_history.detail.export.save")}
    </Button>
    <Button variant="outline" size="sm" onclick={() => run("copy")} disabled={!node || busy !== null}>
        <Copy />
        {busy === "copy" ? t("match_history.detail.export.working") : t("match_history.detail.export.copy")}
    </Button>
</div>
