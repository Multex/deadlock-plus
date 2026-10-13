import { loadReleases, type ReleaseCache } from "$lib/server/releases";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
    // The global fetch, not the load event's: nothing from the visitor's request reaches GitHub.
    // `platform` is absent under `vite dev`, where every visit asks GitHub directly.
    const cache = platform?.caches?.default as ReleaseCache | undefined;
    return { releases: await loadReleases(fetch, cache) };
};
