const DECOR_PATH = /\/themes\/([\w-]+)\/decor\.svelte$/;

export function decorThemeIds(paths: string[]): string[] {
    return paths.flatMap((path) => DECOR_PATH.exec(path)?.[1] ?? []);
}

/** Decor is optional: a theme has some only when `themes/<id>/decor.svelte` exists. */
export function decorLoader<T>(
    modules: Record<string, () => Promise<T>>,
    theme: string,
): (() => Promise<T>) | undefined {
    const path = Object.keys(modules).find((p) => DECOR_PATH.exec(p)?.[1] === theme);
    return path ? modules[path] : undefined;
}
