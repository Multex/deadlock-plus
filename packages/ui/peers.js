/**
 * The packages this one imports but does not ship; the same names as `peerDependencies` in `package.json`.
 * An app passes the list to Vite's `resolve.dedupe`, so the components run against the app's own copies: one
 * Svelte runtime and one bits-ui context per app, whatever versions the other apps in the workspace resolve.
 */
export const peers = [
    "@lucide/svelte",
    "bits-ui",
    "clsx",
    "svelte",
    "tailwind-merge",
    "tailwind-variants",
    "tailwindcss",
    "tw-animate-css",
];

/**
 * TypeScript `paths` entries that point every peer at the copy installed in `appDir`. TypeScript resolves an
 * import from the real location of the importing file, which for this package is outside the app, so without
 * them the components would be type-checked against a second copy of Svelte.
 *
 * @param {string} appDir absolute path of the app that owns the `node_modules` to use
 * @returns {Record<string, string[]>}
 */
export function peerPaths(appDir) {
    const modules = `${appDir.replaceAll("\\", "/").replace(/\/$/, "")}/node_modules`;
    /** @type {Record<string, string[]>} */
    const paths = {};
    for (const name of peers) {
        paths[name] = [`${modules}/${name}`];
        paths[`${name}/*`] = [`${modules}/${name}/*`];
    }
    // A `paths` target is read as a folder, not through the package's `exports`, and this is the one subpath
    // in use whose files sit somewhere else.
    paths["@lucide/svelte/icons/*"] = [`${modules}/@lucide/svelte/dist/icons/*`];
    return paths;
}
