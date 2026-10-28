import { Update } from "@tauri-apps/plugin-updater";

export { Update };
/** What the backend's update check returns; the plugin does not export the type by name. */
export type UpdateMetadata = ConstructorParameters<typeof Update>[0];
