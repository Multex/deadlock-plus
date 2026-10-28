/** A changelog's `YYYY-MM-DD` as that calendar day; parsing it as UTC would show the day before west of Greenwich. */
export function releaseDay(date: string | null): Date | null {
    const m = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
