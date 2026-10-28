import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { MATCH_IDS } from "./identity";
import { defaultScenario } from "./index";
import { simulationRuns } from "./match-detail";

const API = "https://api.deadlock-api.com";
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const REFERENCE: ReadonlyArray<readonly [index: number, detail: string, grade: string]> = [
    [0, "969d3084e51798a5", "9954a309f3196205"],
    [5, "f57dd037f20b1a42", "b2149d9489b53a33"],
    [20, "ee9b8f86806f3f21", "fbe5d19b68fb6920"],
];

describe("demo match detail cost", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        const handle = install(defaultScenario({ appVersion: "1", changelog: "", mapItemsTsv: "" }));
        handles.push(handle);
        return handle;
    };
    const metadata = async (id: number) => (await fetch(`${API}/v1/matches/${id}/metadata`)).text();
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    it.each(REFERENCE)("answers match %i with the same detail and grade as before", async (index, detail, grade) => {
        const handle = start();
        const id = MATCH_IDS[index]!;
        expect(hash(await metadata(id))).toBe(detail);
        expect(hash(JSON.stringify(await handle.invoke("mvp_grade_match", { matchId: id })))).toBe(grade);
    });

    it("simulates a match once however often its detail is read", async () => {
        start();
        const id = MATCH_IDS[3]!;
        const before = simulationRuns.count;
        const first = await metadata(id);
        const second = await metadata(id);
        expect(second).toBe(first);
        expect(simulationRuns.count - before).toBe(1);
    });

    it("grades matches without simulating them", async () => {
        const handle = start();
        const before = simulationRuns.count;
        await handle.invoke("mvp_grades", { matchIds: MATCH_IDS.slice(0, 10) });
        expect(simulationRuns.count - before).toBe(0);
    });
});
