import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BuildNote from "@deadlock-plus/game-ui/item-tooltip/build-note.svelte";
import type { BuildNoteView } from "@deadlock-plus/game-ui/item-tooltip/model";

const note = (avatar: string | null): BuildNoteView => ({
    text: "Rush it",
    sellPriority: null,
    imbueTarget: null,
    avatar,
});

describe("BuildNote author avatar", () => {
    it("draws the author's avatar before the note text", () => {
        const body = render(BuildNote, { props: { note: note("author.png") } }).body;
        const avatar = body.search(
            /<img[^>]*class="avatar[ "][^>]*src="author.png"|<img[^>]*src="author.png"[^>]*class="avatar[ "]/,
        );
        expect(avatar).toBeGreaterThan(-1);
        expect(avatar).toBeLessThan(body.indexOf("Rush it"));
    });

    it("keeps the avatar's space with a placeholder while the avatar is unknown", () => {
        const body = render(BuildNote, { props: { note: note(null) } }).body;
        expect(body).not.toContain("<img");
        const placeholder = body.search(/class="avatar[ "]/);
        expect(placeholder).toBeGreaterThan(-1);
        expect(placeholder).toBeLessThan(body.indexOf("Rush it"));
    });
});
