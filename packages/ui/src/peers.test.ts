import { describe, expect, it } from "vitest";
import manifest from "../package.json";
import { peerPaths, peers } from "../peers.js";

describe("peers", () => {
    it("lists exactly the peer dependencies of the package", () => {
        expect([...peers].sort()).toEqual(Object.keys(manifest.peerDependencies).sort());
    });

    it("points each peer, and its subpaths, at the app's node_modules", () => {
        const paths = peerPaths("D:\\repo\\apps\\desktop\\");

        expect(paths["bits-ui"]).toEqual(["D:/repo/apps/desktop/node_modules/bits-ui"]);
        expect(paths["svelte/*"]).toEqual(["D:/repo/apps/desktop/node_modules/svelte/*"]);
    });

    it("maps the icon subpath that the icon package serves from another folder", () => {
        const paths = peerPaths("/repo/apps/web");

        expect(paths["@lucide/svelte/icons/*"]).toEqual(["/repo/apps/web/node_modules/@lucide/svelte/dist/icons/*"]);
    });
});
