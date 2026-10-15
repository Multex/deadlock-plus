import { costRows, loadCosts, monthlyTotal, totalSpent } from "$lib/server/transparency/costs";
import { loadStats, type Stats } from "$lib/server/transparency/stats";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
    // `platform` is absent under `vite dev`, where the page shows its empty states.
    const store = platform?.env.TRANSPARENCY;
    if (!store) return { stats: {} as Stats, costs: null };

    const [stats, costs] = await Promise.all([loadStats(store), loadCosts(store)]);
    const now = new Date();
    return {
        stats,
        costs: costs && {
            currency: costs.currency,
            items: costRows(costs, now),
            monthly: monthlyTotal(costs, now),
            spent: totalSpent(costs, now),
        },
    };
};
