import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
import { adminAccessRow } from "./admin-access";

/** Rows the page leaves out right now. Reactive: reads the admin access status. */
export const hiddenNow = (id: string): boolean => id === "admin-access" && adminAccessRow(adminAccess.status) === null;
