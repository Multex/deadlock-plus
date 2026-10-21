/** Turns `seen` on the first time the attached element comes within `margin` of the viewport, then stops watching. */
export function visibility(margin = "400px") {
    let seen = $state(false);
    const attach = (node: Element) => {
        if (typeof IntersectionObserver === "undefined") {
            seen = true;
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                seen = true;
                observer.disconnect();
            },
            { rootMargin: margin },
        );
        observer.observe(node);
        return () => observer.disconnect();
    };
    return {
        get seen() {
            return seen;
        },
        attach,
    };
}
