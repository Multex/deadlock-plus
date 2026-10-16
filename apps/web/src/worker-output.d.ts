declare module "*/.svelte-kit/cloudflare/_worker.js" {
    const worker: { fetch: ExportedHandlerFetchHandler<import("./lib/server/env").WorkerEnv> };
    export default worker;
}
