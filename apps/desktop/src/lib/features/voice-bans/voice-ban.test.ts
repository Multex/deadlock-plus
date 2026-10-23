import { describe, expect, it } from "vitest";
import { addMutedUsers, buildExport, mergeImport, parseImport, parseVoiceBan, removeMutedUsers } from "./voice-ban";

const HEADER = "<!-- kv3 encoding:text:version{e21c7f3c} format:generic:version{7412167c} -->\n";
const entry = (id: string, flags = 3) => `\t\t{\n\t\t\tflags = ${flags}\n\t\t\tsteamid = ${id}\n\t\t}`;
const file = (ids: string[], trailingComma = true) =>
    `${HEADER}{\n\tusers = \n\t[\n${ids.map((id) => entry(id)).join(",\n")}${ids.length && trailingComma ? "," : ""}\n\t]\n\tplayer_volume_map = null\n}`;

const A = "76561198035543931";
const B = "76561197991306192";
const C = "76561198787443409";
const D = "76561198177021331";

describe("parseVoiceBan", () => {
    it("reads entries in order, keeping steamids as exact strings", () => {
        expect(parseVoiceBan(file([A, B])).users).toEqual([
            { steamid64: A, flags: 3 },
            { steamid64: B, flags: 3 },
        ]);
    });

    it("treats `users = null` as an empty list", () => {
        expect(parseVoiceBan(`${HEADER}{\n\tusers = null\n\tplayer_volume_map = null\n}`).users).toEqual([]);
    });

    it("treats an empty array as an empty list", () => {
        expect(parseVoiceBan(file([])).users).toEqual([]);
    });

    it("accepts entries with a comma between fields or reversed key order", () => {
        const text = `{\n\tusers = [ { flags = 3, steamid = ${A} }, { steamid = ${B} flags = 1 } ]\n}`;
        expect(parseVoiceBan(text).users).toEqual([
            { steamid64: A, flags: 3 },
            { steamid64: B, flags: 1 },
        ]);
    });

    it("rejects text that is not a voice ban file", () => {
        expect(() => parseVoiceBan("hello")).toThrow();
        expect(() => parseVoiceBan("")).toThrow();
    });
});

describe("removeMutedUsers", () => {
    it("removes one entry and leaves the rest byte-identical", () => {
        expect(removeMutedUsers(file([A, B, C]), [B])).toBe(file([A, C]));
    });

    it("removes several entries at once", () => {
        expect(removeMutedUsers(file([A, B, C, D]), [A, C])).toBe(file([B, D]));
    });

    it("removes the last entry when it has no trailing comma", () => {
        expect(removeMutedUsers(file([A, B], false), [B])).toBe(file([A], false));
    });

    it("removing everything leaves an empty, still parseable list", () => {
        const out = removeMutedUsers(file([A, B]), [A, B]);
        expect(parseVoiceBan(out).users).toEqual([]);
    });

    it("ignores ids that are not present", () => {
        const text = file([A, B]);
        expect(removeMutedUsers(text, [C])).toBe(text);
    });

    it("keeps parts of the file it does not understand", () => {
        const text = file([A, B]).replace("player_volume_map = null", "player_volume_map = null\n\textra = 7");
        expect(removeMutedUsers(text, [A])).toContain("extra = 7");
    });
});

describe("addMutedUsers", () => {
    it("appends after the last entry, matching its trailing-comma style", () => {
        const r = addMutedUsers(file([A, B]), [C]);
        expect(r.text).toBe(file([A, B, C]));
        expect(r.added).toEqual([C]);
    });

    it("appends when the last entry has no trailing comma", () => {
        expect(addMutedUsers(file([A], false), [B, C]).text).toBe(file([A, B, C], false));
    });

    it("fills an empty array", () => {
        expect(parseVoiceBan(addMutedUsers(file([]), [A]).text).users).toEqual([{ steamid64: A, flags: 3 }]);
    });

    it("turns `users = null` into a list", () => {
        const text = `${HEADER}{\n\tusers = null\n\tplayer_volume_map = null\n}`;
        const out = addMutedUsers(text, [A, B]).text;
        expect(parseVoiceBan(out).users.map((u) => u.steamid64)).toEqual([A, B]);
        expect(out).toContain("player_volume_map = null");
    });

    it("skips ids already muted and duplicates within the request", () => {
        const r = addMutedUsers(file([A]), [A, B, B]);
        expect(r.added).toEqual([B]);
        expect(parseVoiceBan(r.text).users.map((u) => u.steamid64)).toEqual([A, B]);
    });

    it("skips values that are not a SteamID64", () => {
        const r = addMutedUsers(file([A]), ["abc", "123", B]);
        expect(r.added).toEqual([B]);
    });

    it("returns the text unchanged when nothing is added", () => {
        const text = file([A]);
        expect(addMutedUsers(text, [A]).text).toBe(text);
    });

    it("uses the requested flags", () => {
        expect(parseVoiceBan(addMutedUsers(file([A]), [B], 1).text).users[1]).toEqual({ steamid64: B, flags: 1 });
    });
});

describe("export / import", () => {
    it("round-trips a subset through JSON", () => {
        expect(parseImport(buildExport([A, B]))).toEqual([A, B]);
    });

    it("reads ids out of a raw voice_ban.dt", () => {
        expect(parseImport(file([A, C]))).toEqual([A, C]);
    });

    it("drops invalid and duplicate ids from JSON", () => {
        const json = JSON.stringify({ version: 1, users: [{ steamid64: A }, { steamid64: A }, { steamid64: "x" }] });
        expect(parseImport(json)).toEqual([A]);
    });

    it("throws on unrecognised input", () => {
        expect(() => parseImport("not json or kv3")).toThrow();
        expect(() => parseImport(JSON.stringify({ version: 1 }))).toThrow();
    });

    it("merging keeps existing entries and only adds new ids", () => {
        const r = mergeImport(file([A, B]), [B, C, D]);
        expect(r.added).toEqual([C, D]);
        expect(parseVoiceBan(r.text).users.map((u) => u.steamid64)).toEqual([A, B, C, D]);
    });
});
