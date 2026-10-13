import { describe, expect, it } from "vitest";
import { sourceLabelKey } from "./ping";

describe("sourceLabelKey", () => {
    it("names the engine and relay sources", () => {
        expect(sourceLabelKey("engine")).toBe("match_history.ping.source_engine");
        expect(sourceLabelKey("icmp")).toBe("match_history.ping.source_icmp");
    });

    it("keeps the time-window label when there is no recording", () => {
        expect(sourceLabelKey(null)).toBe("match_history.ping.source");
    });
});
