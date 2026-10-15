/// <reference types="@sveltejs/adapter-cloudflare" />
import type { WorkerEnv } from "$lib/server/env";

declare global {
    namespace App {
        interface Platform {
            env: WorkerEnv;
        }
    }
}

export {};
