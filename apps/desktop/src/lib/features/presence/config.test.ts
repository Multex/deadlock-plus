import { describe, expect, it } from "vitest";
import { effectiveSlot, getSlot, isCustomised, isEnabled, resetField, resetScope, setField } from "./config";

import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";

const empty = (): PresenceConfig => ({ states: {}, variants: {}, heroes: {} });

describe("getSlot", () => {
    it("returns an empty slot for a missing layer", () => {
        expect(getSlot(empty(), { state: "inMatch" })).toEqual({});
        expect(getSlot(empty(), { state: "inMatch", variant: "ranked", heroId: 7 })).toEqual({});
    });

    it("reads exactly the layer of each scope", () => {
        const config: PresenceConfig = {
            states: { inMatch: { details: "state" } },
            variants: { inMatch: { ranked: { details: "variant" } } },
            heroes: {
                7: {
                    states: { inMatch: { details: "hero-state" } },
                    variants: { inMatch: { ranked: { details: "hero-variant" } } },
                },
            },
        };
        expect(getSlot(config, { state: "inMatch" }).details).toBe("state");
        expect(getSlot(config, { state: "inMatch", variant: "ranked" }).details).toBe("variant");
        expect(getSlot(config, { state: "inMatch", heroId: 7 }).details).toBe("hero-state");
        expect(getSlot(config, { state: "inMatch", variant: "ranked", heroId: 7 }).details).toBe("hero-variant");
    });
});

describe("setField", () => {
    it("creates parents and stores the patch", () => {
        const next = setField(empty(), { state: "inMatch" }, { details: "Hi" });
        expect(next.states).toEqual({ inMatch: { details: "Hi" } });
    });

    it("does not mutate the input", () => {
        const base = empty();
        setField(base, { state: "inMatch" }, { details: "Hi" });
        expect(base).toEqual(empty());
    });

    it("merges into an existing layer and overwrites a field", () => {
        let c = setField(empty(), { state: "inMatch" }, { details: "A", state: "B" });
        c = setField(c, { state: "inMatch" }, { details: "C" });
        expect(c.states.inMatch).toEqual({ details: "C", state: "B" });
    });

    it("deep-merges images", () => {
        let c = setField(empty(), { state: "inMatch" }, { largeImage: { enabled: true } });
        c = setField(c, { state: "inMatch" }, { largeImage: { source: "heroPortrait" } });
        expect(c.states.inMatch?.largeImage).toEqual({ enabled: true, source: "heroPortrait" });
    });

    it("keeps the other image when patching one", () => {
        let c = setField(empty(), { state: "inMatch" }, { smallImage: { enabled: false } });
        c = setField(c, { state: "inMatch" }, { largeImage: { enabled: true } });
        expect(c.states.inMatch).toEqual({ smallImage: { enabled: false }, largeImage: { enabled: true } });
    });

    it("writes a variant layer", () => {
        const c = setField(empty(), { state: "inMatch", variant: "ranked" }, { state: "R" });
        expect(c.variants).toEqual({ inMatch: { ranked: { state: "R" } } });
        expect(c.states).toEqual({});
    });

    it("writes hero layers with both parents present", () => {
        const a = setField(empty(), { state: "inMatch", heroId: 7 }, { details: "H" });
        expect(a.heroes).toEqual({ 7: { states: { inMatch: { details: "H" } }, variants: {} } });
        const b = setField(empty(), { state: "inMatch", variant: "ranked", heroId: 7 }, { details: "HV" });
        expect(b.heroes).toEqual({ 7: { states: {}, variants: { inMatch: { ranked: { details: "HV" } } } } });
    });

    it("treats an undefined value as removing the field", () => {
        let c = setField(empty(), { state: "inMatch" }, { details: "A", state: "B" });
        c = setField(c, { state: "inMatch" }, { details: undefined });
        expect(c.states.inMatch).toEqual({ state: "B" });
    });

    it("drops an image whose fields were all removed", () => {
        let c = setField(empty(), { state: "inMatch" }, { largeImage: { enabled: true } });
        c = setField(c, { state: "inMatch" }, { largeImage: { enabled: undefined } });
        expect(c).toEqual(empty());
    });

    it("drops an empty patch without creating parents", () => {
        expect(setField(empty(), { state: "inMatch", heroId: 3 }, {})).toEqual(empty());
    });

    it("keeps an empty string as a real value", () => {
        const c = setField(empty(), { state: "inMatch" }, { details: "" });
        expect(c.states.inMatch).toEqual({ details: "" });
    });
});

describe("resetField", () => {
    it("removes one field and keeps the rest", () => {
        let c = setField(empty(), { state: "inMatch" }, { details: "A", state: "B" });
        c = resetField(c, { state: "inMatch" }, "details");
        expect(c.states.inMatch).toEqual({ state: "B" });
    });

    it("prunes the layer and parents when the last field goes", () => {
        let c = setField(empty(), { state: "inMatch", variant: "ranked", heroId: 7 }, { details: "A" });
        c = resetField(c, { state: "inMatch", variant: "ranked", heroId: 7 }, "details");
        expect(c).toEqual(empty());
    });

    it("removes a whole image", () => {
        let c = setField(empty(), { state: "inMatch" }, { largeImage: { enabled: true, source: "heroIcon" } });
        c = resetField(c, { state: "inMatch" }, "largeImage");
        expect(c).toEqual(empty());
    });

    it("is a no-op for a missing layer", () => {
        expect(resetField(empty(), { state: "inMatch" }, "details")).toEqual(empty());
    });

    it("does not mutate the input", () => {
        const base = setField(empty(), { state: "inMatch" }, { details: "A" });
        const snapshot = structuredClone(base);
        resetField(base, { state: "inMatch" }, "details");
        expect(base).toEqual(snapshot);
    });
});

describe("resetScope", () => {
    it("removes only the targeted layer", () => {
        let c = setField(empty(), { state: "inMatch" }, { details: "S" });
        c = setField(c, { state: "inMatch", variant: "ranked" }, { details: "V" });
        c = resetScope(c, { state: "inMatch", variant: "ranked" });
        expect(c).toEqual({ states: { inMatch: { details: "S" } }, variants: {}, heroes: {} });
    });

    it("removes a hero layer and the empty hero", () => {
        let c = setField(empty(), { state: "inMatch", heroId: 7 }, { details: "H" });
        c = resetScope(c, { state: "inMatch", heroId: 7 });
        expect(c).toEqual(empty());
    });

    it("keeps the sibling hero layer", () => {
        let c = setField(empty(), { state: "inMatch", heroId: 7 }, { details: "H" });
        c = setField(c, { state: "inMatch", variant: "ranked", heroId: 7 }, { details: "HV" });
        c = resetScope(c, { state: "inMatch", heroId: 7 });
        expect(c.heroes).toEqual({ 7: { states: {}, variants: { inMatch: { ranked: { details: "HV" } } } } });
    });
});

describe("isCustomised", () => {
    it("is false for an empty config and true once a field is set", () => {
        const scope = { state: "inMatch" as const, variant: "ranked" as const };
        expect(isCustomised(empty(), scope)).toBe(false);
        expect(isCustomised(setField(empty(), scope, { details: "x" }), scope)).toBe(true);
    });

    it("looks at the exact scope only", () => {
        const c = setField(empty(), { state: "inMatch" }, { details: "x" });
        expect(isCustomised(c, { state: "inMatch", variant: "ranked" })).toBe(false);
        expect(isCustomised(c, { state: "inMatch", heroId: 7 })).toBe(false);
    });
});

describe("effectiveSlot", () => {
    const defaults: PresenceConfig = {
        states: {
            inMatch: {
                enabled: true,
                details: "d-state",
                state: "s-state",
                largeImage: { enabled: true, source: "heroPortrait" },
                timer: "matchTime",
            },
        },
        variants: { inMatch: { ranked: { state: "s-variant" } } },
        heroes: {},
    };

    it("falls back to the defaults state", () => {
        expect(effectiveSlot(empty(), defaults, { state: "inMatch" }).details).toBe("d-state");
    });

    it("prefers the defaults variant over the defaults state", () => {
        const slot = effectiveSlot(empty(), defaults, { state: "inMatch", variant: "ranked" });
        expect(slot.state).toBe("s-variant");
        expect(slot.details).toBe("d-state");
    });

    it("prefers the user state over the defaults variant", () => {
        const config = setField(empty(), { state: "inMatch" }, { state: "user-state" });
        expect(effectiveSlot(config, defaults, { state: "inMatch", variant: "ranked" }).state).toBe("user-state");
    });

    it("prefers hero-state over state and variant over hero-state", () => {
        let config = setField(empty(), { state: "inMatch" }, { details: "state" });
        config = setField(config, { state: "inMatch", heroId: 7 }, { details: "hero-state" });
        expect(effectiveSlot(config, defaults, { state: "inMatch", heroId: 7 }).details).toBe("hero-state");
        config = setField(config, { state: "inMatch", variant: "ranked" }, { details: "variant" });
        expect(effectiveSlot(config, defaults, { state: "inMatch", variant: "ranked", heroId: 7 }).details).toBe(
            "variant",
        );
        config = setField(config, { state: "inMatch", variant: "ranked", heroId: 7 }, { details: "hero-variant" });
        expect(effectiveSlot(config, defaults, { state: "inMatch", variant: "ranked", heroId: 7 }).details).toBe(
            "hero-variant",
        );
    });

    it("ignores hero layers without a hero id", () => {
        const config = setField(empty(), { state: "inMatch", heroId: 7 }, { details: "hero" });
        expect(effectiveSlot(config, defaults, { state: "inMatch" }).details).toBe("d-state");
    });

    it("ignores variant layers without a variant", () => {
        const config = setField(empty(), { state: "inMatch", variant: "ranked" }, { details: "variant" });
        expect(effectiveSlot(config, defaults, { state: "inMatch" }).details).toBe("d-state");
    });

    it("resolves each field on its own", () => {
        let config = setField(empty(), { state: "inMatch" }, { details: "mine" });
        config = setField(config, { state: "inMatch", heroId: 7 }, { smallText: "hero" });
        expect(effectiveSlot(config, defaults, { state: "inMatch", heroId: 7 })).toMatchObject({
            details: "mine",
            state: "s-state",
            smallText: "hero",
            timer: "matchTime",
        });
    });

    it("resolves image sub-fields on their own", () => {
        const config = setField(empty(), { state: "inMatch" }, { largeImage: { source: "heroIcon" } });
        expect(effectiveSlot(config, defaults, { state: "inMatch" }).largeImage).toEqual({
            enabled: true,
            source: "heroIcon",
        });
    });

    it("lets an empty string win over a default", () => {
        const config = setField(empty(), { state: "inMatch" }, { details: "" });
        expect(effectiveSlot(config, defaults, { state: "inMatch" }).details).toBe("");
    });

    it("returns an empty slot when nothing is set anywhere", () => {
        expect(effectiveSlot(empty(), empty(), { state: "paused" })).toEqual({});
    });
});

describe("isEnabled", () => {
    const defaults = empty();

    it("is on when nothing says otherwise", () => {
        expect(isEnabled(empty(), defaults, { state: "inMatch" })).toBe(true);
    });

    it("follows the state when a variant says nothing", () => {
        const c = setField(empty(), { state: "inMatch" }, { enabled: false });
        expect(isEnabled(c, defaults, { state: "inMatch", variant: "ranked" })).toBe(false);
    });

    it("lets a variant turn itself back on", () => {
        let c = setField(empty(), { state: "inMatch" }, { enabled: false });
        c = setField(c, { state: "inMatch", variant: "ranked" }, { enabled: true });
        expect(isEnabled(c, defaults, { state: "inMatch", variant: "ranked" })).toBe(true);
        expect(isEnabled(c, defaults, { state: "inMatch", variant: "unranked" })).toBe(false);
    });

    it("lets a hero layer turn one state off for that hero only", () => {
        const c = setField(empty(), { state: "inMatch", heroId: 7 }, { enabled: false });
        expect(isEnabled(c, defaults, { state: "inMatch", heroId: 7 })).toBe(false);
        expect(isEnabled(c, defaults, { state: "inMatch", heroId: 8 })).toBe(true);
        expect(isEnabled(c, defaults, { state: "inMatch" })).toBe(true);
    });
});
