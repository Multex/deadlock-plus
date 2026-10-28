import type { Reroute } from "@sveltejs/kit";
import { localizedRoute } from "$lib/i18n/routes";

// `/de/features` renders the `/features` route; the layout reads the language back from the address. Only the
// localized pages are mapped, so `/de/tt` is a 404 and never reaches the `[ref]` landing redirect.
export const reroute: Reroute = ({ url }) => localizedRoute(url.pathname);
