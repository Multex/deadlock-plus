import { describe, expect, it } from "vitest";
import { textAround } from "./text-around";

describe("textAround", () => {
    it("returns the text on each side of the value", () => {
        expect(textAround((name) => `By ${name}`)).toEqual(["By ", ""]);
        expect(textAround((name) => `${name} のビルド`)).toEqual(["", " のビルド"]);
        expect(textAround((name) => `Von ${name} erstellt`)).toEqual(["Von ", " erstellt"]);
        expect(textAround((killer) => `${killer} l'a tué`)).toEqual(["", " l'a tué"]);
    });

    it("keeps the whole text before the value when the translation leaves the placeholder out", () => {
        expect(textAround(() => "Author")).toEqual(["Author", ""]);
    });
});
