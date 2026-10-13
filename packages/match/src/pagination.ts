export const PAGE_SIZE = 25;

export interface Page<T> {
    items: T[];
    page: number;
    pageCount: number;
    total: number;
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Page<T> {
    const pageCount = Math.max(1, Math.ceil(items.length / size));
    const current = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
    const start = (current - 1) * size;
    return { items: items.slice(start, start + size), page: current, pageCount, total: items.length };
}
