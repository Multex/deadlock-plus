declare module "*/.svelte-kit/cloudflare/_worker.js" {
    const worker: { fetch: ExportedHandlerFetchHandler<import("./lib/server/invite-poll").PollEnv> };
    export default worker;
}
