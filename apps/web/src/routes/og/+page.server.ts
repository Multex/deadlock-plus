import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";

// The page only exists so `scripts/og.mjs` can photograph it from the dev server.
export function load() {
    if (!dev) error(404, "Not found");
}
