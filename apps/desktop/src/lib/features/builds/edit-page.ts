import { untrack } from "svelte";
import { i18n, t } from "$lib/core/i18n.svelte";
import { editHref, protoLanguage, type LoadDeps } from "./editor/load";
import type { EditOrigin } from "./editor/session";

/**
 * The editor URL that reopens what the editor shows. A save or "Keep the game's" deletes the draft a URL may
 * name, and a new build's URL reopens it blank, so the page keeps its URL on this.
 */
export function shownHref(origin: EditOrigin, draftId: string | undefined): string | null {
    if (draftId !== undefined) return editHref({ source: "draft", id: draftId });
    return origin.kind === "local" ? editHref({ source: "local", id: origin.buildId }) : null;
}

/** Read untracked: a locale change must not reopen the editor, which would drop its undo history and selection. */
export function sessionText(): Pick<LoadDeps, "language" | "copyName" | "categoryName"> {
    return untrack(() => ({
        language: protoLanguage(i18n.locale),
        copyName: (name: string) => t("builds.mine.copy_name", { name }),
        categoryName: t("builds.editor.first_category"),
    }));
}
