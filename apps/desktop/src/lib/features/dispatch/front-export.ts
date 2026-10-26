import type { EditionKind } from "@deadlock-plus/stats/dispatch/types";
import { DISPATCH_PAPER, type CardAspect, type EditionView } from "./edition-view";
import { exportTarget, type ExportPick, type ExportTarget } from "./export-plan";
import { COVER as COLLECTORS_COVER } from "./kinds/collectors/layout";
import { PAGE as MONTHLY_PAGE } from "./kinds/monthly/layout";
import { YEAR_END_COVER } from "./kinds/year_end/reveal";

/** Each kind's own cover, at the size it is drawn: the "front page" export is that cover, not the weekly paper. */
export const FRONT_PAGE_SIZES: Record<EditionKind, { width: number; height: number }> = {
    weekly: DISPATCH_PAPER,
    monthly: MONTHLY_PAGE,
    collectors: COLLECTORS_COVER,
    year_end: YEAR_END_COVER,
};

export function frontExportTarget(view: EditionView, pick: ExportPick, aspect: CardAspect): ExportTarget {
    const target = exportTarget(view, pick, aspect);
    if (pick !== "front_page") return target;
    const { width, height } = FRONT_PAGE_SIZES[view.kind];
    return { ...target, width, height };
}

/** The properties a cover's SVG art takes from its stylesheet: paint, stroke and type. */
export const SVG_INLINE_PROPS = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "text-transform",
    "text-anchor",
    "dominant-baseline",
    "paint-order",
    "filter",
    "mix-blend-mode",
] as const;

type StyleReader = (el: Element) => Pick<CSSStyleDeclaration, "getPropertyValue">;
type StyleWriter = (el: Element) => Pick<CSSStyleDeclaration, "setProperty">;

/**
 * html-to-image deep-copies an `<svg>` without walking it, so class rules on the elements inside (the
 * Collector's medal arc text, its tick marks) never reach the image. `copy` must be a structural clone of
 * `live`; each SVG descendant of `copy` gets `live`'s computed values as inline style.
 */
export function inlineSvgStyles(
    live: ParentNode,
    copy: ParentNode,
    io: { read: StyleReader; style: StyleWriter } = {
        read: (el) => getComputedStyle(el),
        style: (el) => (el as SVGElement).style,
    },
): void {
    const from = live.querySelectorAll("svg *");
    const to = copy.querySelectorAll("svg *");
    for (let i = 0; i < Math.min(from.length, to.length); i++) {
        const computed = io.read(from[i]);
        const style = io.style(to[i]);
        for (const p of SVG_INLINE_PROPS) {
            const value = computed.getPropertyValue(p);
            if (value) style.setProperty(p, value);
        }
    }
}
