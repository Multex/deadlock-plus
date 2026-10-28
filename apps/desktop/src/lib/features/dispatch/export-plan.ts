import type { Component } from "svelte";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { CardAspect, EditionView } from "./edition-view";
import { collectorsSections } from "./kinds/collectors/export";
import type { CollectorsView } from "./kinds/collectors/view";
import type { CoverArt } from "./kinds/monthly/art";
import { monthlySections } from "./kinds/monthly/export";
import type { Magazine } from "./kinds/monthly/magazine";
import { weeklySections } from "./kinds/weekly/export";
import { yearEndSections } from "./kinds/year_end/export";
import type { YearEndPoster } from "./kinds/year_end/year-end-view";

export const EXPORT_ASPECTS: readonly CardAspect[] = ["9:16", "1:1", "16:9"];

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** What a kind's inside pages are drawn from, once loaded. Each cover loads its own. */
export type ExportModel =
    | { kind: "weekly" }
    | { kind: "monthly"; mag: Magazine; art: CoverArt }
    | { kind: "collectors"; v: CollectorsView }
    | { kind: "year_end"; poster: YearEndPoster };

export interface ExportPart {
    // The list mixes components, each with its own props, so the props type is erased here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Component<any>;
    props: Record<string, unknown>;
}

export interface ExportSection extends ExportPart {
    id: string;
    label: string;
    size: { width: number; height: number };
    /** The page beside `component` in an open spread. */
    facing?: ExportPart;
    /** Where the image's window sits on the component: a Year-End panel is a crop of the whole poster. */
    offset?: { x: number; y: number };
    /** A Weekly tabloid card: drawn at the picked shape, with the footer inside its own frame. */
    card?: boolean;
}

export interface ExportOptions {
    model: ExportModel | null;
    /** The shape of a Weekly section card. */
    aspect: CardAspect;
    t: Translate;
}

const part = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

export function exportFile(editionId: string, pick: string, aspect: CardAspect | null): string {
    const ratio = aspect === null ? null : aspect.replace(":", "x");
    return ["deadlock-plus-dispatch", part(editionId), part(pick), ratio].filter((p) => p !== null).join("-") + ".png";
}

/** Every image the edition offers, in picker order: its cover first, then what its own medium has inside. */
export function exportSections(edition: Edition, view: EditionView, options: ExportOptions): ExportSection[] {
    const { model, t } = options;
    switch (edition.window.kind) {
        case "monthly":
            return monthlySections(edition, view, model?.kind === "monthly" ? model : null, t);
        case "collectors":
            return collectorsSections(edition, model?.kind === "collectors" ? model.v : null, t);
        case "year_end":
            return yearEndSections(edition, view, model?.kind === "year_end" ? model.poster : null, t);
        default:
            return weeklySections(edition, view, options.aspect, t);
    }
}
