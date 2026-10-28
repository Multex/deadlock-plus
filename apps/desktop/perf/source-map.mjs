import { existsSync, readFileSync } from "node:fs";

const B64 = Object.fromEntries(
    [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((c, i) => [c, i]),
);

function decodeMappings(mappings) {
    const lines = [];
    let source = 0;
    let line = 0;
    let column = 0;
    let name = 0;
    for (const text of mappings.split(";")) {
        const segments = [];
        let generated = 0;
        for (const segment of text.split(",")) {
            if (!segment) continue;
            const values = [];
            let value = 0;
            let shift = 0;
            for (const char of segment) {
                const digit = B64[char];
                value += (digit & 31) << shift;
                if (digit & 32) shift += 5;
                else {
                    values.push(value & 1 ? -(value >>> 1) : value >>> 1);
                    value = 0;
                    shift = 0;
                }
            }
            generated += values[0];
            if (values.length < 4) continue;
            source += values[1];
            line += values[2];
            column += values[3];
            if (values.length > 4) name += values[4];
            segments.push([generated, source, line, column, values.length > 4 ? name : -1]);
        }
        lines.push(segments);
    }
    return lines;
}

/** Resolves positions in built files to their source, reading `<file>.map` next to each one. */
export function sourceMaps() {
    const cache = new Map();
    const load = (file) => {
        if (!cache.has(file)) {
            const path = `${file}.map`;
            if (!existsSync(path)) cache.set(file, null);
            else {
                const map = JSON.parse(readFileSync(path, "utf8"));
                cache.set(file, { map, lines: decodeMappings(map.mappings) });
            }
        }
        return cache.get(file);
    };
    /** `line` and `column` are 0-based, as in a CPU profile. */
    return (file, line, column) => {
        const loaded = load(file);
        const segments = loaded?.lines[line];
        if (!segments?.length) return null;
        let found = null;
        for (const s of segments) {
            if (s[0] > column) break;
            found = s;
        }
        found ??= segments[0];
        const source = loaded.map.sources[found[1]]
            .replace(/^(\.\.\/)+/, "")
            .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, "");
        return { source, line: found[2] + 1, name: found[4] >= 0 ? loaded.map.names[found[4]] : null };
    };
}
