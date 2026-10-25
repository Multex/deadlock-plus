export interface SiteAddress {
    name: string;
    ending: string;
}

/** The host without its scheme, split before the last dot so the ending can take the accent colour. */
export function siteAddress(url: string): SiteAddress {
    const { host } = new URL(url);
    const dot = host.lastIndexOf(".");
    return dot <= 0 ? { name: host, ending: "" } : { name: host.slice(0, dot), ending: host.slice(dot) };
}
