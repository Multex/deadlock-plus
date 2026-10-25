import { redirect } from "@sveltejs/kit";
import { MAIN_WINDOW, windowLabel } from "$lib/core/window-label";
import { launchRedirect } from "$lib/shell/last-route.svelte";

// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;

// Reads nothing from the load event, so it does not rerun on every navigation. It does run again for its own
// redirect, which `launchRedirect` answers with nothing.
export async function load() {
    if (windowLabel() !== MAIN_WINDOW) return;
    const target = await launchRedirect();
    if (target) redirect(307, target);
}
