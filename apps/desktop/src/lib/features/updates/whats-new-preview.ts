const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/**
 * Demo builds only: `?preview=<version>` shows the changelog's Unreleased section as that release, so the page
 * can be screenshotted with notes that have not shipped.
 */
export function previewVersion(params: URLSearchParams, demo: boolean): string | null {
    if (!demo) return null;
    const value = params.get("preview");
    return value && VERSION.test(value) ? value : null;
}
