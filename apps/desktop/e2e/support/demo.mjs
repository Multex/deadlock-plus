// Builds and serves the frontend on made-up data, without touching the `build` folder Tauri bundles.
// Usage, from apps/desktop: node e2e/support/demo.mjs [build] [preview]
import process from "node:process";

// Set before Vite loads svelte.config.js, which picks the demo output directories from it.
process.env.VITE_DEMO ||= "1";

const { build, preview } = await import("vite");
const steps = process.argv.slice(2);
const port = Number(process.env.DEMO_PORT ?? 4310);

// Vite reports chunk sizes and plugin timings as warnings; a test run only wants to hear about failures.
if (steps.includes("build")) await build({ logLevel: process.env.DEMO_LOG_LEVEL });
if (steps.includes("preview")) {
    const server = await preview({ preview: { host: "127.0.0.1", port, strictPort: true } });
    server.printUrls();
}
