export type SelectMenuItem = {
    value: string;
    label: string;
    group?: string;
    disabled?: boolean;
    meta?: string;
};

export type SelectMenuGroup<T extends SelectMenuItem> = {
    heading: string | null;
    items: T[];
};

/** Groups come in the order their first item appears; items without a group share one headless group. */
export function groupItems<T extends SelectMenuItem>(items: readonly T[]): SelectMenuGroup<T>[] {
    const groups = new Map<string | null, SelectMenuGroup<T>>();
    for (const item of items) {
        const heading = item.group || null;
        let group = groups.get(heading);
        if (!group) {
            group = { heading, items: [] };
            groups.set(heading, group);
        }
        group.items.push(item);
    }
    return [...groups.values()];
}

export function findItem<T extends SelectMenuItem>(items: readonly T[], value: string | undefined): T | undefined {
    if (value === undefined) return undefined;
    return items.find((item) => item.value === value);
}
