import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const NIGHTLY_TAG = /^v\d+\.\d+\.\d+-nightly\.\d{8}(\.\d+)?$/;
const BETA_TAG = /^v\d+\.\d+\.\d+-beta\.\d+$/;

function parse(version) {
    const match = VERSION.exec(version);
    if (!match) throw new Error(`Not a version: ${version}`);
    return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? [] };
}

function compareIdentifiers(a, b) {
    const an = /^\d+$/.test(a);
    const bn = /^\d+$/.test(b);
    if (an && bn) return Number(a) - Number(b);
    if (an !== bn) return an ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver precedence, the same order the updater uses to decide whether a feed's version is newer. */
export function compareVersions(a, b) {
    const x = parse(a);
    const y = parse(b);
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
    if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
    for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
        const d = compareIdentifiers(x.pre[i], y.pre[i]);
        if (d !== 0) return d;
    }
    return x.pre.length - y.pre.length;
}

const core = (version) => parse(version).core.join(".");

/**
 * Nightlies carry the version of the release being worked towards, so a nightly sorts above every beta of that
 * release and below the release itself. That is the release an open beta is testing, else the patch after the last
 * release. A later nightly never takes a lower version than an earlier one.
 */
function nightlyBase(packageVersion, tags) {
    const {
        core: [major, minor, patch],
        pre,
    } = parse(packageVersion);
    let base = pre.length ? core(packageVersion) : `${major}.${minor}.${patch + 1}`;
    for (const tag of tags) {
        if (!BETA_TAG.test(tag) && !NIGHTLY_TAG.test(tag)) continue;
        const candidate = core(tag);
        if (compareVersions(candidate, packageVersion) > 0 && compareVersions(candidate, base) > 0) base = candidate;
    }
    return base;
}

const utcDay = (date) => date.toISOString().slice(0, 10).replaceAll("-", "");

export function nightlyVersion({ packageVersion, tags, date }) {
    const stem = `${nightlyBase(packageVersion, tags)}-nightly.${utcDay(date)}`;
    let taken = 0;
    for (const tag of tags) {
        if (tag === `v${stem}`) taken = Math.max(taken, 1);
        else if (tag.startsWith(`v${stem}.`)) taken = Math.max(taken, Number(tag.slice(stem.length + 2)) || 0);
    }
    return taken ? `${stem}.${taken + 1}` : stem;
}

const nightliesNewestFirst = (tags) =>
    tags.filter((tag) => NIGHTLY_TAG.test(tag)).sort((a, b) => compareVersions(b, a));

export function latestNightly(tags) {
    return nightliesNewestFirst(tags)[0] ?? null;
}

export function nightliesToPrune(tags, keep) {
    return nightliesNewestFirst(tags).slice(keep);
}

export function withPackageVersion(text, version) {
    return text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
}

/**
 * `GITHUB_OUTPUT` lines: whether to skip (main unchanged since the last nightly), the version and tag to build, and
 * the older nightlies to delete once it is published so `keep` remain.
 */
export function planOutputs({ packageVersion, tags, date, head, lastNightlyCommit, force, keep }) {
    const skip = !force && lastNightlyCommit === head;
    const version = nightlyVersion({ packageVersion, tags, date });
    const prune = nightliesToPrune(tags, keep - 1).join(" ");
    return `skip=${skip}\nversion=${version}\ntag=v${version}\nprune=${prune}\n`;
}

const KEEP = 7;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function plan(force) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const packageVersion = JSON.parse(readFileSync(`${root}apps/desktop/package.json`, "utf8")).version;
    const tags = git("tag", "--list", "v*").split(/\r?\n/).filter(Boolean);
    const last = latestNightly(tags);
    const lastNightlyCommit = last === null ? null : git("rev-list", "-n", "1", last);
    const head = git("rev-parse", "HEAD");
    const out = planOutputs({ packageVersion, tags, date: new Date(), head, lastNightlyCommit, force, keep: KEEP });
    if (out.startsWith("skip=true")) console.error(`main has not changed since ${last}; skipping.`);
    process.stdout.write(out);
}

function setVersion(version) {
    parse(version);
    const file = fileURLToPath(new URL("../apps/desktop/package.json", import.meta.url));
    writeFileSync(file, withPackageVersion(readFileSync(file, "utf8"), version));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, arg] = process.argv.slice(2);
    try {
        if (command === "plan") plan(arg === "--force");
        else if (command === "set-version" && arg) setVersion(arg);
        else {
            console.error("Usage: node scripts/nightly.mjs plan [--force]");
            console.error("       node scripts/nightly.mjs set-version <version>");
            process.exit(1);
        }
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
