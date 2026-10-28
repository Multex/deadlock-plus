import { getContext, setContext } from "svelte";
import enCatalog from "../../../../../locales/web/en.json";
import { createTranslator, type Catalog, type Translator } from "./core";

export { around, type Catalog, type Translator } from "./core";

export const en: Catalog = enCatalog;

export const english = createTranslator("en", { en });

const KEY = Symbol("i18n");

export function setI18n(translator: Translator): void {
    setContext(KEY, translator);
}

/** English when no layout set one, as in a test that renders a page on its own. */
export function useI18n(): Translator {
    return getContext<Translator | undefined>(KEY) ?? english;
}
