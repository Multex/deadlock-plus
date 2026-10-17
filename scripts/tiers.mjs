import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP_TIER = 3;

// Same-tier edges that are allowed to exist. An entry whose edge disappears is an error.
export const SAME_TIER_ALLOWLIST = [
    ["dp-versioned", "dp-atomic"],
    ["dp-kv", "dp-versioned"],
    ["dp-export", "dp-atomic"],
    ["dp-helper", "dp-server-picker"],
];

const CRATE_DIR = /\/crates\/(ring\d+)\/[^/]+\/Cargo\.toml$/;

function isTauri(name) {
    return name === "tauri" || name.startsWith("tauri-");
}

export function checkTiers(metadata, allowlist = SAME_TIER_ALLOWLIST) {
    const violations = [];
    const packages = metadata.packages;
    const tiers = new Map();

    for (const pkg of packages) {
        const declared = pkg.metadata?.dp?.tier;
        const dir = pkg.manifest_path.replaceAll("\\", "/").match(CRATE_DIR)?.[1];
        if (!Number.isInteger(declared)) {
            violations.push(`${pkg.name} declares no tier (add [package.metadata.dp] tier = N)`);
            continue;
        }
        tiers.set(pkg.name, declared);
        if (dir !== undefined && dir !== `ring${declared}`) {
            violations.push(`${pkg.name} declares tier ${declared} but lives in crates/${dir}`);
        }
    }

    const allowed = new Set(allowlist.map(([from, to]) => `${from} -> ${to}`));
    const seen = new Set();

    for (const pkg of packages) {
        const tier = tiers.get(pkg.name);
        if (tier === undefined) continue;
        for (const dep of pkg.dependencies) {
            if (dep.kind === "dev") continue;
            if (tier < APP_TIER && isTauri(dep.name)) {
                violations.push(
                    `${pkg.name} (tier ${tier}) depends on ${dep.name}; only tier ${APP_TIER} may use Tauri`,
                );
                continue;
            }
            const depTier = tiers.get(dep.name);
            if (depTier === undefined || depTier < tier) continue;
            const edge = `${pkg.name} -> ${dep.name}`;
            if (depTier === tier && allowed.has(edge)) {
                seen.add(edge);
                continue;
            }
            violations.push(
                `${pkg.name} (tier ${tier}) depends on ${dep.name} (tier ${depTier}); dependencies must point to a lower tier`,
            );
        }
    }

    for (const edge of allowed) {
        if (!seen.has(edge)) violations.push(`stale allowlist entry ${edge}: no such same-tier dependency`);
    }

    return violations;
}

function main() {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const output = execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    const violations = checkTiers(JSON.parse(output));
    if (violations.length) {
        for (const line of violations) console.error(line);
        process.exit(1);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
