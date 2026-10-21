import { describe, expect, it } from "vitest";
import { formatGameNumber, markupText, parseMarkup, type MarkupNode } from "./markup";

const text = (t: string): MarkupNode => ({ kind: "text", text: t });

describe("parseMarkup", () => {
    it("reads Spirit Burn: an inline attribute, a placeholder from values, a break and a diminish note", () => {
        const source =
            'Dealing significant <span class="inline-attribute-label SpiritDamage">spirit damage</span> to an enemy ' +
            "within {s:DamageThresholdDuration}s causes an explosion.<br>" +
            '<span class="diminish">The cooldown is per enemy.</span>';

        expect(parseMarkup(source, { DamageThresholdDuration: 5 })).toEqual([
            text("Dealing significant "),
            { kind: "attribute", name: "SpiritDamage", label: "spirit damage" },
            text(" to an enemy within "),
            { kind: "value", name: "DamageThresholdDuration", value: 5, signed: false, text: "5" },
            text("s causes an explosion."),
            { kind: "break" },
            { kind: "span", styles: ["diminish"], children: [text("The cooldown is per enemy.")] },
        ]);
    });

    it("reads Silencer: a highlight wrapping a placeholder", () => {
        const source =
            'Victims are immune for <span class="highlight">{s:ImmunityDuration}s</span> after silence expires.';

        expect(parseMarkup(source, { ImmunityDuration: 10 })).toEqual([
            text("Victims are immune for "),
            {
                kind: "span",
                styles: ["highlight"],
                children: [
                    { kind: "value", name: "ImmunityDuration", value: 10, signed: false, text: "10" },
                    text("s"),
                ],
            },
            text(" after silence expires."),
        ]);
    });

    it("keeps each typed highlight, small diminish, isNegative and the italics class", () => {
        const styles = [
            "highlight_weapon",
            "highlight_courage",
            "highlight_tech",
            "highlight_spirit",
            "highlight_armor",
            "highlight_fortitude",
            "highlight_special",
            "small_diminish",
            "isNegative",
        ] as const;
        for (const style of styles) {
            expect(parseMarkup(`<span class="${style}">x</span>`)).toEqual([
                { kind: "span", styles: [style], children: [text("x")] },
            ]);
        }
        expect(parseMarkup('<span class="italics">x</span>')).toEqual([
            { kind: "span", styles: ["italic"], children: [text("x")] },
        ]);
    });

    it("reads b and i tags as bold and italic spans", () => {
        expect(parseMarkup("<b>a</b><i>b</i>")).toEqual([
            { kind: "span", styles: ["bold"], children: [text("a")] },
            { kind: "span", styles: ["italic"], children: [text("b")] },
        ]);
    });

    it("drops unknown span classes but keeps the content", () => {
        expect(parseMarkup('<span class="highlight evil">x</span>')).toEqual([
            { kind: "span", styles: ["highlight"], children: [text("x")] },
        ]);
    });

    it("reads every line break form, including the stray closing one the game strings use", () => {
        expect(parseMarkup("a<br>b<br/>c<br />d</br>e")).toEqual([
            text("a"),
            { kind: "break" },
            text("b"),
            { kind: "break" },
            text("c"),
            { kind: "break" },
            text("d"),
            { kind: "break" },
            text("e"),
        ]);
    });

    it("reads property icon panels, closed or not, as icons (Bebop poison jar)", () => {
        const source =
            'are <Panel class="AbilityPropertyIcon prop_move_speed"></Panel><span class="highlight">Slowed</span> ' +
            'and <Panel class="AbilityPropertyIcon prop_silence"> <span class="highlight">Silenced</span>.';

        expect(parseMarkup(source)).toEqual([
            text("are "),
            { kind: "icon", cssClass: "move_speed" },
            { kind: "span", styles: ["highlight"], children: [text("Slowed")] },
            text(" and "),
            { kind: "icon", cssClass: "silence" },
            text(" "),
            { kind: "span", styles: ["highlight"], children: [text("Silenced")] },
            text("."),
        ]);
    });

    it("reads unresolved game tokens: inline attributes without a label and key bindings", () => {
        expect(parseMarkup("Hold {g:citadel_binding:'Mantle'} for {g:citadel_inline_attribute:'Heal'}.")).toEqual([
            text("Hold "),
            { kind: "binding", action: "Mantle" },
            text(" for "),
            { kind: "attribute", name: "Heal", label: null },
            text("."),
        ]);
    });

    it("signs a placeholder that follows {s:sign}", () => {
        expect(parseMarkup("{s:sign}{s:Bonus} and {s:sign}{s:Penalty}", { Bonus: 4, Penalty: -2 })).toEqual([
            { kind: "value", name: "Bonus", value: 4, signed: true, text: "+4" },
            text(" and "),
            { kind: "value", name: "Penalty", value: -2, signed: true, text: "-2" },
        ]);
    });

    it("leaves a missing value empty instead of inventing one", () => {
        expect(parseMarkup("{s:Missing}s")).toEqual([
            { kind: "value", name: "Missing", value: null, signed: false, text: "" },
            text("s"),
        ]);
    });

    it("keeps unknown tags, unknown game tokens and stray braces as text, never as markup", () => {
        expect(parseMarkup('<img src="x" onerror="alert(1)"> {g:other:\'x\'} {oops}')).toEqual([
            text('<img src="x" onerror="alert(1)"> {g:other:\'x\'} {oops}'),
        ]);
        expect(parseMarkup("<script>alert(1)</script>")).toEqual([text("<script>alert(1)</script>")]);
        expect(parseMarkup("1 < 2 > 0")).toEqual([text("1 < 2 > 0")]);
    });

    it("decodes entities into text", () => {
        expect(parseMarkup("Fire &amp; Ice &lt;3&nbsp;&#39;x&#x41;")).toEqual([text("Fire & Ice <3 'xA")]);
    });

    it("closes spans left open at the end and ignores closing tags with nothing open", () => {
        expect(parseMarkup('</span><span class="diminish">a<span class="highlight">b')).toEqual([
            {
                kind: "span",
                styles: ["diminish"],
                children: [text("a"), { kind: "span", styles: ["highlight"], children: [text("b")] }],
            },
        ]);
    });

    it("reads backslash-escaped attribute quotes", () => {
        expect(parseMarkup('<span class=\\"highlight\\">x</span>')).toEqual([
            { kind: "span", styles: ["highlight"], children: [text("x")] },
        ]);
    });

    it("returns nothing for an empty source", () => {
        expect(parseMarkup("")).toEqual([]);
    });
});

describe("markupText", () => {
    it("flattens nodes to plain text with bindings named and breaks as newlines", () => {
        const nodes = parseMarkup(
            '<span class="inline-attribute-label SpiritDamage">spirit damage</span> in {s:X}s<br>' +
                "{g:citadel_binding:'Mantle'}{g:citadel_inline_attribute:'Heal'}",
            { X: 2.5 },
        );
        expect(markupText(nodes)).toBe("spirit damage in 2.5s\n[Mantle]Heal");
    });
});

describe("formatGameNumber", () => {
    it("shows plain digits with no thousands separator and trims decimals", () => {
        expect(formatGameNumber(6400)).toBe("6400");
        expect(formatGameNumber(1.04)).toBe("1.04");
        expect(formatGameNumber(2.5)).toBe("2.5");
        expect(formatGameNumber(-70)).toBe("-70");
        expect(formatGameNumber(24 + 0.06 * 50)).toBe("27");
        expect(formatGameNumber(-0)).toBe("0");
    });

    it("caps decimals when asked", () => {
        expect(formatGameNumber(26.8234, 2)).toBe("26.82");
        expect(formatGameNumber(0.30000000000000004)).toBe("0.3");
    });
});
