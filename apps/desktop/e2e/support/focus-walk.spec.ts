import { expect, test } from "@playwright/test";
import { problemsOf, type Stop, type Walk } from "./focus-walk";

const stop = (id: string, region: string): Stop => ({ id, label: id, region, unmarked: null, onScreen: true });
const body: Stop = { id: "body", label: "body", region: "other", unmarked: "focus is on the body", onScreen: false };
const lap = (stops: Stop[], backward = false): Walk => ({ stops, missed: [], jumps: [], closed: true, backward });

const [collapse, home, search, row, discord] = [
    stop("collapse", "titlebar"),
    stop("home", "sidebar"),
    stop("search", "main"),
    stop("row", "main"),
    stop("discord", "statusbar"),
];

test.describe("the order check of a Tab lap", () => {
    test("passes a lap that starts midway and wraps through the body", () => {
        expect(problemsOf(lap([row, discord, body, collapse, home, search]))).toEqual([]);
        expect(problemsOf(lap([search, home, collapse, body, discord, row], true))).toEqual([]);
    });

    // Chrome sometimes takes Shift+Tab off the first control straight to the last one, never through the body.
    test("passes a lap that starts midway and wraps without the body", () => {
        expect(problemsOf(lap([search, home, collapse, discord, row], true))).toEqual([]);
        expect(problemsOf(lap([row, discord, collapse, home, search]))).toEqual([]);
    });

    test("still flags a stop out of order in a lap that wraps without the body", () => {
        expect(problemsOf(lap([search, collapse, home, discord, row], true))).toEqual([
            "collapse in titlebar comes after home in sidebar",
        ]);
        expect(problemsOf(lap([row, discord, home, collapse, search]))).toEqual([
            "collapse in titlebar comes after home in sidebar",
        ]);
    });
});
