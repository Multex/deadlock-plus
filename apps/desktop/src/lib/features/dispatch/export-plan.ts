import {
    CARD_SIZES,
    DISPATCH_PAPER,
    sectionsFor,
    type CardAspect,
    type EditionView,
    type SectionId,
} from "./edition-view";

export const EXPORT_ASPECTS: readonly CardAspect[] = ["9:16", "1:1", "16:9"];

/** The whole front page, or one section as a card. */
export type ExportPick = "front_page" | SectionId;

export interface ExportTarget {
    pick: ExportPick;
    /** `null` for the front page, which keeps the paper's own size. */
    aspect: CardAspect | null;
    width: number;
    height: number;
    fileName: string;
}

const part = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

export function exportFile(editionId: string, pick: ExportPick, aspect: CardAspect | null): string {
    const ratio = aspect === null ? null : aspect.replace(":", "x");
    return ["deadlock-plus-dispatch", part(editionId), part(pick), ratio].filter((p) => p !== null).join("-") + ".png";
}

export function exportPicks(view: EditionView): ExportPick[] {
    return ["front_page", ...sectionsFor(view)];
}

export function exportTarget(view: EditionView, pick: ExportPick, aspect: CardAspect): ExportTarget {
    if (pick === "front_page") {
        return { pick, aspect: null, ...DISPATCH_PAPER, fileName: exportFile(view.id, pick, null) };
    }
    const { width, height } = CARD_SIZES[aspect];
    return { pick, aspect, width, height, fileName: exportFile(view.id, pick, aspect) };
}

export function exportTargets(view: EditionView): ExportTarget[] {
    const [front, ...sections] = exportPicks(view);
    return [
        exportTarget(view, front, EXPORT_ASPECTS[0]),
        ...sections.flatMap((pick) => EXPORT_ASPECTS.map((aspect) => exportTarget(view, pick, aspect))),
    ];
}
