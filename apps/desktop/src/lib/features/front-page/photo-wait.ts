export type PhotoWait = "ready" | "failed" | "timeout" | "none";

/** How long the paper waits for its photo before it lands without one. */
export const PHOTO_WAIT_MS = 1500;

export interface PhotoWaitDeps {
    decode(src: string): Promise<void>;
    timeout(ms: number): Promise<void>;
}

export function waitForPhoto(src: string | null, deps: PhotoWaitDeps, capMs: number): Promise<PhotoWait> {
    if (!src) return Promise.resolve("none");
    return Promise.race([
        deps.decode(src).then(
            () => "ready" as const,
            () => "failed" as const,
        ),
        deps.timeout(capMs).then(() => "timeout" as const),
    ]);
}

export const browserPhotoWait: PhotoWaitDeps = {
    decode(src) {
        const img = new Image();
        img.src = src;
        return img.decode();
    },
    timeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
