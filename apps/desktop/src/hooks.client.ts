import type { ClientInit } from "@sveltejs/kit";

export const init: ClientInit = async () => {
    // The branch is a build-time constant, so a normal build drops the demo code and its scenarios.
    if (import.meta.env.VITE_DEMO) (await import("$lib/core/demo-bridge")).startDemo(import.meta.env.VITE_DEMO);
};
