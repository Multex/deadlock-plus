import { createDeadlockApi } from "@deadlock-plus/deadlock-api";

// The global is looked up on every call: demo mode replaces it after this module has loaded.
export const deadlockApi = createDeadlockApi({ fetch: (...args) => fetch(...args) });
