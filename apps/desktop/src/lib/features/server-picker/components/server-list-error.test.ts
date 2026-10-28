import { describe, expect, it } from "vitest";
import { render } from "svelte/server";

import { t } from "$lib/core/i18n.svelte";
import ServerListError from "./server-list-error.svelte";

describe("server list error", () => {
    it("is a calm region error with Retry and no restart advice", () => {
        const body = render(ServerListError, { props: { onretry: () => {} } }).body;
        expect(body).toContain('data-region="server-picker-list"');
        expect(body).toContain('data-region-state="error"');
        expect(body).toContain(t("server_picker.load_failed"));
        expect(body).toContain("Retry");
        expect(body).not.toContain("Restart");
    });
});
