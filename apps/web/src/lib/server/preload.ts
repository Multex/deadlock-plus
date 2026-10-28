type Asset = { type: "font" | "css" | "js" | "asset"; path: string };

// The faces the header and the hero draw: the brand mark, the headline and the body text.
const ABOVE_THE_FOLD = /\/(valvepulp-bold|valveoracle-semibold|retaildemo-regular)\.[\w-]+\.woff2$/;

export function preloadAsset({ type, path }: Asset): boolean {
    if (type === "font") return ABOVE_THE_FOLD.test(path);
    return type === "js" || type === "css";
}
