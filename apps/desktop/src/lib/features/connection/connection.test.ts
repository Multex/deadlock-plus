import { describe, expect, it } from "vitest";
import { t } from "$lib/core/i18n.svelte";
import {
    appendPoint,
    gapVariant,
    historySeries,
    lossVariant,
    mergeTail,
    traceErrorText,
    HISTORY_SHOWN,
} from "./connection";
import type { HistoryPoint } from "./types";

describe("gapVariant", () => {
    it("grades the longest inbound gap", () => {
        expect(gapVariant(99)).toBe("success");
        expect(gapVariant(100)).toBe("warning");
        expect(gapVariant(249)).toBe("warning");
        expect(gapVariant(250)).toBe("destructive");
    });
});

describe("lossVariant", () => {
    it("grades a loss percentage", () => {
        expect(lossVariant(0)).toBe("success");
        expect(lossVariant(0.1)).toBe("warning");
        expect(lossVariant(2.9)).toBe("warning");
        expect(lossVariant(3)).toBe("destructive");
    });
});

describe("mergeTail", () => {
    const at = (t: number): HistoryPoint => ({ t, raw: t });

    it("appends the new points", () => {
        expect(mergeTail([at(1), at(2)], [at(3)]).map((p) => p.t)).toEqual([1, 2, 3]);
    });

    it("keeps the same array when nothing is new", () => {
        const history = [at(1)];
        expect(mergeTail(history, [])).toBe(history);
    });

    it("drops points it already has", () => {
        expect(mergeTail([at(1), at(2)], [at(2), at(3)]).map((p) => p.t)).toEqual([1, 2, 3]);
    });

    it("keeps only the newest HISTORY_SHOWN points", () => {
        const history = Array.from({ length: HISTORY_SHOWN }, (_, i) => at(i + 1));
        const next = mergeTail(history, [at(HISTORY_SHOWN + 1), at(HISTORY_SHOWN + 2)]);
        expect(next).toHaveLength(HISTORY_SHOWN);
        expect(next[0].t).toBe(3);
        expect(next.at(-1)?.t).toBe(HISTORY_SHOWN + 2);
    });
});

describe("historySeries", () => {
    it("keeps the newest points and draws only the ping line", () => {
        const history = Array.from({ length: HISTORY_SHOWN + 5 }, (_, i) => ({ t: i, raw: i % 2 ? null : i }));
        const { shown, series } = historySeries(history);
        expect(shown).toHaveLength(HISTORY_SHOWN);
        expect(series.map((s) => s.label)).toEqual(["Ping"]);
        expect(series[0].values[0]).toBe(5 % 2 ? null : 5);
        expect(series[0].values[1]).toBe(6);
    });
});

describe("appendPoint", () => {
    it("adds a point and keeps only the newest HISTORY_SHOWN", () => {
        const full: HistoryPoint[] = Array.from({ length: HISTORY_SHOWN }, (_, i) => ({ t: i, raw: i }));
        const next = appendPoint(full, { t: HISTORY_SHOWN, raw: 9 });
        expect(next).toHaveLength(HISTORY_SHOWN);
        expect(next[0].t).toBe(1);
        expect(next.at(-1)).toEqual({ t: HISTORY_SHOWN, raw: 9 });
    });
});

describe("traceErrorText", () => {
    it("explains an out-of-date helper", () => {
        expect(traceErrorText("helper_out_of_date")).toBe(t("connection.notices.helper_out_of_date"));
    });

    it("shows any other failure as sent", () => {
        expect(traceErrorText("Could not reach the Deadlock+ service.")).toBe("Could not reach the Deadlock+ service.");
    });
});
