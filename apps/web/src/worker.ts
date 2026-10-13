import sveltekit from "../.svelte-kit/cloudflare/_worker.js";
import { pollInvites, type PollEnv } from "./lib/server/invite-poll";

// The SvelteKit adapter only emits a fetch handler, so the cron handler is added around its output.
export default {
    fetch: sveltekit.fetch,
    scheduled(_controller, env, ctx) {
        ctx.waitUntil(pollInvites(env));
    },
} satisfies ExportedHandler<PollEnv>;
