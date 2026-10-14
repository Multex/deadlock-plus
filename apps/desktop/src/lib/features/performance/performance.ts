import { t } from "$lib/core/i18n.svelte";
import type { Platform } from "$lib/core/platform";
import type { AddonError, AddonInfo, AddonScan, AddonScanReport, Finding, Rule, Severity } from "./api";

export type ScanStatus = "noScripts" | "clean" | "flagged";

export type LocatedFinding = Finding & { path: string };

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export function ruleTitle(rule: Rule): string {
    switch (rule) {
        case "nulledNotCancelled":
            return t("performance.rules.nulled_not_cancelled");
        case "unguardedRearm":
            return t("performance.rules.unguarded_rearm");
    }
}

export function findingText(finding: Finding): string {
    const params = { fn: finding.function };
    switch (finding.rule) {
        case "nulledNotCancelled":
            return t("performance.findings.nulled_not_cancelled", params);
        case "unguardedRearm":
            return t("performance.findings.unguarded_rearm", params);
    }
}

export function severityLabel(severity: Severity): string {
    switch (severity) {
        case "low":
            return t("performance.severity.low");
        case "medium":
            return t("performance.severity.medium");
        case "high":
            return t("performance.severity.high");
    }
}

export function findingCount(scan: AddonScan): number {
    return scan.scripts.reduce((n, s) => n + s.findings.length, 0);
}

export function scanStatus(scan: AddonScan): ScanStatus {
    if (scan.scriptsScanned === 0) return "noScripts";
    return findingCount(scan) > 0 ? "flagged" : "clean";
}

export function worstSeverity(scan: AddonScan): Severity | null {
    let worst: Severity | null = null;
    for (const script of scan.scripts) {
        for (const f of script.findings) {
            if (worst === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst]) worst = f.severity;
        }
    }
    return worst;
}

export function flattenFindings(scan: AddonScan): LocatedFinding[] {
    return scan.scripts
        .flatMap((s) => s.findings.map((f) => ({ ...f, path: s.path })))
        .sort(
            (a, b) =>
                SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
                a.path.localeCompare(b.path) ||
                a.line - b.line,
        );
}

export function addonTitle(info: AddonInfo, scan: AddonScan | undefined): string {
    if (scan) return scan.label;
    if (info.modId) return t("performance.addon.gamebanana_mod", { id: info.modId });
    return info.fileName;
}

export interface ScanSummary {
    scanned: number;
    noScripts: number;
    clean: number;
    flagged: number;
    findings: number;
}

export function summarize(scans: Record<string, AddonScan>): ScanSummary {
    const summary: ScanSummary = { scanned: 0, noScripts: 0, clean: 0, flagged: 0, findings: 0 };
    for (const scan of Object.values(scans)) {
        summary.scanned++;
        summary.findings += findingCount(scan);
        summary[scanStatus(scan)]++;
    }
    return summary;
}

export interface AddonGroups {
    flagged: AddonInfo[];
    clean: AddonInfo[];
    noScripts: AddonInfo[];
    failed: AddonInfo[];
    pending: AddonInfo[];
}

export function groupAddons(
    addons: AddonInfo[],
    scans: Record<string, AddonScan>,
    failures: Record<string, AddonError>,
): AddonGroups {
    const groups: AddonGroups = { flagged: [], clean: [], noScripts: [], failed: [], pending: [] };
    for (const addon of addons) {
        const scan = scans[addon.fileName];
        if (failures[addon.fileName]) groups.failed.push(addon);
        else if (!scan) groups.pending.push(addon);
        else groups[scanStatus(scan)].push(addon);
    }
    const weight = (a: AddonInfo) => {
        const scan = scans[a.fileName];
        return { severity: SEVERITY_RANK[worstSeverity(scan) ?? "low"], count: findingCount(scan) };
    };
    groups.flagged.sort((a, b) => {
        const [x, y] = [weight(a), weight(b)];
        return y.severity - x.severity || y.count - x.count;
    });
    return groups;
}

export function indexReport(report: AddonScanReport): {
    scans: Record<string, AddonScan>;
    failures: Record<string, AddonError>;
} {
    return {
        scans: Object.fromEntries(report.scans.map((s) => [s.fileName, s])),
        failures: Object.fromEntries(report.failures.map((f) => [f.fileName, f.error])),
    };
}

export function scanPercent(done: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

export function framePolyline(values: number[], width: number, height: number, ceilingMs: number): string {
    if (values.length < 2 || ceilingMs <= 0) return "";
    const step = width / (values.length - 1);
    return values
        .map((v, i) => {
            const y = height - (Math.min(v, ceilingMs) / ceilingMs) * height;
            return `${+(i * step).toFixed(2)},${+y.toFixed(2)}`;
        })
        .join(" ");
}

export function formatDuration(ms: number): string {
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function frameCaptureNote(platform: Platform): string {
    switch (platform) {
        case "windows":
            return t("performance.frame_capture.note_windows");
        case "linux":
            return t("performance.frame_capture.note_linux");
        case "macos":
            return t("performance.frame_capture.note_macos");
    }
}
