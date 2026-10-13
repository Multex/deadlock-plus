/// <reference types="@sveltejs/adapter-cloudflare" />
import type { PollEnv } from "$lib/server/invite-poll";

declare global {
    namespace App {
        interface Platform {
            env: PollEnv;
        }
    }
}

export {};
