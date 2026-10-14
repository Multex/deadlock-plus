import { toast } from "svelte-sonner";
import { t } from "./i18n.svelte";
import { openUrl } from "./opener";

/** Never rejects: a failure shows a plain toast and the raw reason goes to the log. */
export async function openLink(url: string, open: (url: string) => Promise<void> = openUrl): Promise<void> {
    try {
        await open(url);
    } catch (e) {
        console.warn(`could not open ${url}:`, e);
        toast.error(t("common.link_open_failed"));
    }
}
