import { i18n } from "$lib/core/i18n.svelte";

export async function load() {
    await i18n.namespace("dispatch");
}
