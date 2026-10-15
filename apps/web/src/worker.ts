import sveltekit from "../.svelte-kit/cloudflare/_worker.js";
import type { WorkerEnv } from "./lib/server/env";
import { pollInvites } from "./lib/server/invite-poll";
import { promoteCosts } from "@deadlock-plus/costs";
import { refreshStats } from "./lib/server/transparency/stats";

// The SvelteKit adapter only emits a fetch handler, so the cron handler is added around its output.
export default {
    fetch: sveltekit.fetch,
    scheduled(_controller, env, ctx) {
        ctx.waitUntil(pollInvites(env));
        if (env.TRANSPARENCY) {
            ctx.waitUntil(refreshStats(env, env.TRANSPARENCY));
            ctx.waitUntil(promoteCosts(env.TRANSPARENCY));
        }
    },
} satisfies ExportedHandler<WorkerEnv>;
