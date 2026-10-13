import { landingRef } from "@deadlock-plus/links";
import type { ParamMatcher } from "@sveltejs/kit";

export const match: ParamMatcher = (param) => landingRef(param) !== null;
