import type { ParamMatcher } from "@sveltejs/kit";
import { SHOWN_CATEGORIES } from "$lib/features/settings/catalog";

export const match: ParamMatcher = (param) => SHOWN_CATEGORIES.some((c) => c.id === param);
