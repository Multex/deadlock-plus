import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    ANNOUNCE_KEY_ID,
    allowedLink,
    announcementId,
    fromBase64url,
    isVersionReq,
    nextIssuedAt,
    readPayload,
    signPayload,
    validateDraft,
    type Payload,
} from "../src/feed";

const NOW = new Date("2026-10-28T12:00:00Z");

async function keyPair(): Promise<{ jwk: string; x: string }> {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    return { jwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x }), x: jwk.x as string };
}

/** The app embeds only the raw 32-byte public key, so verification starts from that and nothing else. */
function rawPublicKey(x: string) {
    // The fixed DER header of an Ed25519 SubjectPublicKeyInfo, followed by the 32 key bytes.
    const header = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
    const spki = Uint8Array.from([...header, ...fromBase64url(x)]);
    return createPublicKey({ key: spki, format: "der", type: "spki" });
}

const PAYLOAD: Payload = {
    version: 1,
    issuedAt: "2026-10-28T12:00:00Z",
    announcements: [{ id: "update-now-2026-10-28", title: "Update now", body: "Привет\nline two", severity: "info" }],
};

describe("signPayload", () => {
    it("signs the UTF-8 payload bytes so the raw public key verifies them", async () => {
        const { jwk, x } = await keyPair();
        const envelope = await signPayload(PAYLOAD, jwk);
        const bytes = fromBase64url(envelope.payload);
        expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(PAYLOAD));
        expect(verify(null, bytes, rawPublicKey(x), fromBase64url(envelope.signature))).toBe(true);
    });

    it("fails verification under another key", async () => {
        const { jwk } = await keyPair();
        const other = await keyPair();
        const envelope = await signPayload(PAYLOAD, jwk);
        const bytes = fromBase64url(envelope.payload);
        expect(verify(null, bytes, rawPublicKey(other.x), fromBase64url(envelope.signature))).toBe(false);
    });

    it("builds the envelope with the key id and unpadded base64url", async () => {
        const { jwk } = await keyPair();
        const envelope = await signPayload(PAYLOAD, jwk);
        expect(Object.keys(envelope).sort()).toEqual(["keyId", "payload", "signature"]);
        expect(envelope.keyId).toBe(ANNOUNCE_KEY_ID);
        expect(ANNOUNCE_KEY_ID).toBe("2026-10");
        for (const part of [envelope.payload, envelope.signature]) expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(fromBase64url(envelope.signature)).toHaveLength(64);
    });

    it("accepts a key that Windows PowerShell piped in with a BOM and a line break", async () => {
        const { jwk, x } = await keyPair();
        const envelope = await signPayload(PAYLOAD, `\uFEFF${jwk}\r\n`);
        const bytes = fromBase64url(envelope.payload);
        expect(verify(null, bytes, rawPublicKey(x), fromBase64url(envelope.signature))).toBe(true);
    });

    it("rejects a key that is not an Ed25519 private JWK", async () => {
        await expect(signPayload(PAYLOAD, "not json")).rejects.toThrow();
        await expect(signPayload(PAYLOAD, JSON.stringify({ kty: "OKP", crv: "Ed25519" }))).rejects.toThrow();
    });
});

describe("readPayload", () => {
    it("reads back what was signed", async () => {
        const { jwk } = await keyPair();
        expect(readPayload(JSON.stringify(await signPayload(PAYLOAD, jwk)))).toEqual(PAYLOAD);
    });

    it("gives null for anything else", () => {
        for (const raw of ["", "{}", "[]", '{"payload":"%%%"}', JSON.stringify({ payload: "e30" })]) {
            expect(readPayload(raw), raw).toBeNull();
        }
    });
});

describe("nextIssuedAt", () => {
    it("is now, without milliseconds", () => {
        expect(nextIssuedAt(undefined, new Date("2026-10-28T12:00:00.789Z"))).toBe("2026-10-28T12:00:00Z");
    });

    it("always moves past the previous feed, even with a clock behind it", () => {
        expect(nextIssuedAt("2026-10-28T12:00:00Z", NOW)).toBe("2026-10-28T12:00:01Z");
        expect(nextIssuedAt("2026-10-29T00:00:00Z", NOW)).toBe("2026-10-29T00:00:01Z");
        expect(nextIssuedAt("2026-10-28T11:00:00Z", NOW)).toBe("2026-10-28T12:00:00Z");
    });
});

describe("announcementId", () => {
    it("is the title's slug and the day", () => {
        expect(announcementId("Update to 0.13.2 now!", NOW, [])).toBe("update-to-0-13-2-now-2026-10-28");
    });

    it("stays unique", () => {
        const taken = ["hello-2026-10-28", "hello-2026-10-28-2"];
        expect(announcementId("Hello", NOW, taken)).toBe("hello-2026-10-28-3");
    });

    it("keeps within 64 characters of [a-z0-9-]", () => {
        for (const title of ["x".repeat(80), "Привет", "Crème brûlée", "---"]) {
            const id = announcementId(title, NOW, []);
            expect(id, title).toMatch(/^[a-z0-9-]{1,64}$/);
        }
        expect(announcementId("Привет", NOW, [])).toBe("announcement-2026-10-28");
        expect(announcementId("Crème brûlée", NOW, [])).toBe("creme-brulee-2026-10-28");
    });
});

describe("allowedLink", () => {
    it("allows https links on our own domains", () => {
        for (const url of [
            "https://deadlockplus.app/download",
            "https://www.deadlockplus.app/",
            "https://discord.gg/abc123",
            "https://discord.com/invite/abc123",
            "https://github.com/deadlock-plus/deadlock-plus/releases/tag/v0.13.2",
        ]) {
            expect(allowedLink(url), url).toBe(url);
        }
    });

    it("refuses everything else", () => {
        for (const url of [
            "http://deadlockplus.app/",
            "https://deadlockplus.app.evil.com/",
            "https://evil.com/deadlockplus.app",
            "https://user@deadlockplus.app/",
            "https://deadlockplus.app:8443/",
            "https://discord.gg/",
            "https://discord.com/channels/1/2",
            "https://github.com/someone-else/repo",
            "https://github.com/deadlock-plus",
            "javascript:alert(1)",
            "not a url",
        ]) {
            expect(allowedLink(url), url).toBeNull();
        }
    });
});

describe("isVersionReq", () => {
    it("accepts semver requirements", () => {
        for (const req of [
            ">=0.13.0, <0.13.2",
            "=0.13.0",
            "0.13",
            "^0.14",
            "~0.13.1",
            "*",
            "<1.0.0-beta.2",
            "0.13.*",
        ]) {
            expect(isVersionReq(req), req).toBe(true);
        }
    });

    it("refuses anything else", () => {
        for (const req of ["", "latest", "0.13.0 - 0.13.2", ">=01.0.0", "0.*.1", ">= 0.13, ", "1.0.0+build", "*, <1"]) {
            expect(isVersionReq(req), req).toBe(false);
        }
    });
});

describe("validateDraft", () => {
    const base = { title: "Update now", body: "A fix is out.", severity: "warning" };

    it("keeps only the fields that were given", () => {
        expect(validateDraft(base, NOW)).toEqual({ title: "Update now", body: "A fix is out.", severity: "warning" });
    });

    it("turns a typed \\n into a new line", () => {
        expect(validateDraft({ ...base, body: "one\\ntwo" }, NOW)).toMatchObject({ body: "one\ntwo" });
    });

    it("fills every optional field", () => {
        const draft = validateDraft(
            {
                ...base,
                versions: ">=0.13.0, <0.13.2",
                platforms: "windows",
                starts: "2026-10-29",
                ends: "2026-11-01T18:30:00+02:00",
                link: "https://deadlockplus.app/download",
                label: "Download",
            },
            NOW,
        );
        expect(draft).toEqual({
            ...base,
            versions: ">=0.13.0, <0.13.2",
            platforms: ["windows"],
            startsAt: "2026-10-29T00:00:00Z",
            endsAt: "2026-11-01T16:30:00Z",
            link: { url: "https://deadlockplus.app/download", label: "Download" },
        });
    });

    it.each([
        ["an empty title", { title: "  " }, "title"],
        ["a long title", { title: "x".repeat(81) }, "title"],
        ["an empty body", { body: "" }, "text"],
        ["a long body", { body: "x".repeat(601) }, "text"],
        ["an unknown severity", { severity: "loud" }, "severity"],
        ["a bad version range", { versions: "latest" }, "version"],
        ["an unknown platform", { platforms: "macos" }, "platform"],
        ["a bad start", { starts: "tomorrow" }, "start"],
        ["an impossible day", { ends: "2026-02-30" }, "end"],
        ["an end in the past", { ends: "2026-10-27" }, "end"],
        ["an end before the start", { starts: "2026-11-02", ends: "2026-11-01" }, "end"],
        ["a link elsewhere", { link: "https://evil.com/", label: "Go" }, "link"],
        ["a link without a label", { link: "https://deadlockplus.app/" }, "label"],
        ["a label without a link", { label: "Go" }, "link"],
        ["a long label", { link: "https://deadlockplus.app/", label: "x".repeat(41) }, "label"],
    ])("refuses %s with a reason", (_, change, word) => {
        const result = validateDraft({ ...base, ...change }, NOW);
        expect(typeof result).toBe("string");
        expect((result as string).toLowerCase()).toContain(word);
    });

    it("counts characters, not UTF-16 units", () => {
        expect(typeof validateDraft({ ...base, title: "🎉".repeat(80) }, NOW)).toBe("object");
    });
});
