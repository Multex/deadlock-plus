import { loadShopUiArt } from "$lib/features/gamedata/vdata";
import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";

type Images = Partial<Record<ShopUiImage, string>>;

const state = $state<{ images: Images }>({ images: {} });
let requested = false;

// A CSS mask or background that fails to load draws nothing, which would leave a card without its tier
// numeral, so only images that decode are handed out and the CSS fallback covers the rest.
function decodes(src: string): Promise<boolean> {
    const image = new Image();
    image.src = src;
    return image.decode().then(
        () => true,
        () => false,
    );
}

async function loadUsable(): Promise<Images> {
    const entries = Object.entries(await loadShopUiArt()) as [ShopUiImage, string][];
    const usable = await Promise.all(entries.map(async ([name, src]) => [name, src, await decodes(src)] as const));
    return Object.fromEntries(usable.filter(([, , ok]) => ok).map(([name, src]) => [name, src]));
}

/** The game's own card textures, loaded once for every chip; empty until they load or when the game cannot be read. */
export function cardArt(): Images {
    if (!requested) {
        requested = true;
        void loadUsable().then((images) => (state.images = images));
    }
    return state.images;
}
