import { error } from "@sveltejs/kit";
import { themeById } from "$lib/content/theme-pages";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
    const theme = themeById(params.id);
    if (!theme) error(404, "Not found");
    return { id: theme.id };
};
