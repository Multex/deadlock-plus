// Demo build for the perf scripts, with hidden source maps so a CPU profile can name the source function.
// Hidden maps add no comment to the chunks, so the sizes match a plain demo build.
// Usage, from apps/desktop: DEMO_ID=perf node perf/build.mjs
import process from "node:process";

process.env.VITE_DEMO ||= "1";
process.env.DEMO_ID ||= "perf";

const { build } = await import("vite");
await build({ logLevel: "error", build: { sourcemap: "hidden" } });
