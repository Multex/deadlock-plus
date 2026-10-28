import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Where the sweep writes its summary; `A11Y_OUT` moves it. Relative paths start at `apps/desktop`. */
export const A11Y_OUT = path.resolve(process.env.A11Y_OUT ?? "test-results/a11y-summary");
/** One file per page the sweep checked, merged into the summary once every worker is done. */
export const A11Y_RAW = path.join(A11Y_OUT, "raw");

export interface PageResult {
    route: string;
    path: string;
    theme: string;
    /** `page` for the route as it loads, else the open state that was checked. */
    state: string;
    violations: {
        id: string;
        impact: string | null;
        help: string;
        helpUrl: string;
        nodes: { target: string; html: string }[];
    }[];
}

interface RuleSummary {
    rule: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    /** Failing elements across every page checked. */
    count: number;
    pages: number;
    routes: string[];
    themes: string[];
    states: string[];
    /** The selectors that fail most often, with how many pages each fails on. */
    examples: { target: string; html: string; pages: number }[];
}

const IMPACT_ORDER = ["critical", "serious", "moderate", "minor"];

export function summarise(results: PageResult[]): RuleSummary[] {
    const rules = new Map<string, RuleSummary & { targets: Map<string, { html: string; pages: number }> }>();
    for (const result of results) {
        for (const violation of result.violations) {
            let rule = rules.get(violation.id);
            if (!rule) {
                rule = {
                    rule: violation.id,
                    impact: violation.impact,
                    help: violation.help,
                    helpUrl: violation.helpUrl,
                    count: 0,
                    pages: 0,
                    routes: [],
                    themes: [],
                    states: [],
                    examples: [],
                    targets: new Map(),
                };
                rules.set(violation.id, rule);
            }
            rule.count += violation.nodes.length;
            rule.pages += 1;
            const where = result.state === "page" ? result.route : `${result.route} (${result.state})`;
            if (!rule.routes.includes(where)) rule.routes.push(where);
            if (!rule.themes.includes(result.theme)) rule.themes.push(result.theme);
            if (!rule.states.includes(result.state)) rule.states.push(result.state);
            for (const node of violation.nodes) {
                const seen = rule.targets.get(node.target) ?? { html: node.html, pages: 0 };
                seen.pages += 1;
                rule.targets.set(node.target, seen);
            }
        }
    }
    return [...rules.values()]
        .map(({ targets, ...rule }) => ({
            ...rule,
            routes: rule.routes.sort(),
            themes: rule.themes.sort(),
            examples: [...targets]
                .map(([target, { html, pages }]) => ({ target, html, pages }))
                .sort((a, b) => b.pages - a.pages)
                .slice(0, 5),
        }))
        .sort(
            (a, b) =>
                IMPACT_ORDER.indexOf(a.impact ?? "minor") - IMPACT_ORDER.indexOf(b.impact ?? "minor") ||
                b.count - a.count,
        );
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

function markdown(rules: RuleSummary[], results: PageResult[], themes: string[]): string {
    const lines = [
        "# Accessibility sweep",
        "",
        `${results.length} pages checked (WCAG 2.1 A and AA): ${new Set(results.map((r) => r.route)).size} routes, ` +
            `${themes.length} themes, open states: ${[...new Set(results.map((r) => r.state))].join(", ")}.`,
        "",
        "| Rule | Impact | Elements | Pages | Routes | Themes | Example selector |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
        ...rules.map(
            (r) =>
                `| [${r.rule}](${r.helpUrl}) | ${r.impact ?? ""} | ${r.count} | ${r.pages} | ${r.routes.length} | ` +
                `${r.themes.length} | \`${cell(r.examples[0]?.target ?? "")}\` |`,
        ),
        "",
    ];
    for (const r of rules) {
        lines.push(`## ${r.rule} (${r.impact ?? "no impact"})`, "", r.help, "");
        lines.push(`- Routes: ${r.routes.join(", ")}`);
        lines.push(`- Themes: ${r.themes.length === themes.length ? "all" : r.themes.join(", ")}`);
        lines.push("- Top selectors:");
        for (const e of r.examples) lines.push(`  - \`${cell(e.target)}\` on ${e.pages} pages: \`${cell(e.html)}\``);
        lines.push("");
    }
    return lines.join("\n");
}

export function writeSummary(): void {
    let files: string[];
    try {
        files = readdirSync(A11Y_RAW).filter((file) => file.endsWith(".json"));
    } catch {
        return;
    }
    const results = files.map((file) => JSON.parse(readFileSync(path.join(A11Y_RAW, file), "utf8")) as PageResult);
    if (!results.length) return;
    const themes = [...new Set(results.map((r) => r.theme))].sort();
    const rules = summarise(results);
    writeFileSync(
        path.join(A11Y_OUT, "summary.json"),
        `${JSON.stringify({ pages: results.length, themes, rules }, null, 4)}\n`,
    );
    writeFileSync(path.join(A11Y_OUT, "summary.md"), markdown(rules, results, themes));
}

/** Playwright's global setup for the sweep: starts from an empty raw folder and merges it once the run ends. */
export default function setup(): () => void {
    rmSync(A11Y_RAW, { recursive: true, force: true });
    mkdirSync(A11Y_RAW, { recursive: true });
    return writeSummary;
}
