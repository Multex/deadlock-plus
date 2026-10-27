import { readFileSync } from "node:fs";

const PREFIX = "\0locale-split:";

/**
 * Splits a locale catalog at import time so a big namespace can load with its route while the file Crowdin reads
 * stays whole: `en.json?omit=a,b` is the catalog without those top-level keys, `en.json?pick=a,b` is only them.
 * @returns {import("vite").Plugin}
 */
export function localeSplit() {
    return {
        name: "deadlock-plus:locale-split",
        enforce: "pre",
        async resolveId(source, importer) {
            const [file, query] = source.split("?", 2);
            if (!query || !file.endsWith(".json") || !/\b(omit|pick)=/.test(query)) return null;
            const resolved = await this.resolve(file, importer, { skipSelf: true });
            return resolved && `${PREFIX}${resolved.id}?${query}`;
        },
        load(id) {
            if (!id.startsWith(PREFIX)) return null;
            const [file, query] = id.slice(PREFIX.length).split("?", 2);
            const params = new URLSearchParams(query);
            const omit = params.get("omit")?.split(",") ?? [];
            const pick = params.get("pick")?.split(",");
            this.addWatchFile(file);
            const catalog = JSON.parse(readFileSync(file, "utf8"));
            const kept = Object.entries(catalog).filter(([key]) => (pick ? pick.includes(key) : !omit.includes(key)));
            // A string through JSON.parse parses faster than the same data as an object literal.
            return `export default JSON.parse(${JSON.stringify(JSON.stringify(Object.fromEntries(kept)))});`;
        },
    };
}
