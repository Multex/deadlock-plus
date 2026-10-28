import { radioTarget } from "@deadlock-plus/ui/radio-group";
import type { CardAspect } from "../edition-view";
import { exportFile } from "../export-plan";
import { videoFileName, type VideoExportResult } from "../video/export-video";
import type { VideoKind } from "../video/scene";

export type ShareFormat = "picture" | "video";

/** What the preview sits in: the place the file ends up. */
export type StageFrame = "phone" | "post" | "player" | "chat";

export type ShapeName = "tall" | "square" | "wide";

export const SHAPES: readonly { aspect: CardAspect; name: ShapeName }[] = [
    { aspect: "9:16", name: "tall" },
    { aspect: "1:1", name: "square" },
    { aspect: "16:9", name: "wide" },
];

const nameOf = (aspect: CardAspect): ShapeName => SHAPES.find((s) => s.aspect === aspect)?.name ?? "tall";

export const destinationKey = (aspect: CardAspect) => `dispatch.share.where.${nameOf(aspect)}`;
export const shapeKey = (aspect: CardAspect) => `dispatch.export.aspect.${nameOf(aspect)}`;

export const ratioOf = (aspect: CardAspect) => {
    const [w, h] = aspect.split(":").map(Number);
    return w / h;
};

interface SectionLike {
    id: string;
    size: { width: number; height: number };
    card?: boolean;
}

export function stageFor(
    format: ShareFormat,
    section: SectionLike,
    cardAspect: CardAspect,
    videoAspect: CardAspect,
): { frame: StageFrame; aspect: CardAspect | null; ratio: number } {
    if (format === "video") {
        const frame = videoAspect === "9:16" ? "phone" : videoAspect === "1:1" ? "post" : "player";
        return { frame, aspect: videoAspect, ratio: ratioOf(videoAspect) };
    }
    if (section.card) {
        // A wide picture goes to X or a server feed as a post; a player only makes sense for a video.
        return { frame: cardAspect === "9:16" ? "phone" : "post", aspect: cardAspect, ratio: ratioOf(cardAspect) };
    }
    return { frame: "chat", aspect: null, ratio: section.size.width / section.size.height };
}

export function chosenSection<T extends { id: string }>(sections: readonly T[], id: string): T {
    return sections.find((s) => s.id === id) ?? sections[0];
}

export function nextRadio<T>(key: string, values: readonly T[], current: T): T | null {
    const next = radioTarget(key, Math.max(0, values.indexOf(current)), values.length);
    return next === null ? null : values[next];
}

export function shareFileName(input: {
    viewId: string;
    format: ShareFormat;
    videoKind: VideoKind | null;
    section: SectionLike;
    cardAspect: CardAspect;
    videoAspect: CardAspect;
}): string {
    const { viewId, section } = input;
    if (input.format === "video" && input.videoKind) return videoFileName(viewId, input.videoKind, input.videoAspect);
    return exportFile(viewId, section.id, section.card ? input.cardAspect : null);
}

/** The room each frame's own chrome takes around the media, in CSS pixels. */
export const FRAME_CHROME: Record<StageFrame, { w: number; h: number }> = {
    phone: { w: 28, h: 28 },
    post: { w: 26, h: 112 },
    player: { w: 20, h: 58 },
    chat: { w: 96, h: 64 },
};

/** The biggest media box of `ratio` that fits `room` once the frame's chrome is around it. */
export function mediaBox(room: { w: number; h: number }, ratio: number, frame: StageFrame): { w: number; h: number } {
    const chrome = FRAME_CHROME[frame];
    const maxW = room.w - chrome.w;
    const maxH = room.h - chrome.h;
    if (maxW <= 0 || maxH <= 0) return { w: 0, h: 0 };
    const w = Math.min(maxW, maxH * ratio);
    return { w: Math.floor(w), h: Math.floor(w / ratio) };
}

export type VideoStatus =
    | { state: "idle" }
    | { state: "encoding"; progress: number }
    | { state: "done"; silent: boolean; fileName: string }
    | { state: "error"; error: unknown };

export function afterVideoExport(result: VideoExportResult, fileName: string): VideoStatus {
    switch (result.status) {
        case "saved":
            return { state: "done", silent: result.silent, fileName };
        case "failed":
            return { state: "error", error: result.error };
        default:
            return { state: "idle" };
    }
}
