export type BuildsTab = "public" | "mine";

export function buildsTab(params: URLSearchParams): BuildsTab {
    return params.get("tab") === "mine" ? "mine" : "public";
}

/** The public browser filtered to one author's builds; the browser shows the account id until the name resolves. */
export function authorBuildsHref(accountId: number, heroId: number): string {
    return `/builds?hero=${heroId}&author=${accountId}`;
}
