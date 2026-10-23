import { editHref } from "./editor/load";
import type { EditOrigin } from "./editor/session";

/**
 * The editor URL that reopens what the editor shows. A save or "Keep the game's" deletes the draft a URL may
 * name, and a new build's URL reopens it blank, so the page keeps its URL on this.
 */
export function shownHref(origin: EditOrigin, draftId: string | undefined): string | null {
    if (draftId !== undefined) return editHref({ source: "draft", id: draftId });
    return origin.kind === "local" ? editHref({ source: "local", id: origin.buildId }) : null;
}
