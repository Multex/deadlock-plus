// `scripts/register.mjs` loads this file with Node's type stripping, which cannot resolve extensionless relative
// imports: import only packages here.
import { InteractionContextType, PermissionFlagsBits } from "discord-api-types/v10";
import { makeSlashCommand } from "discord-hono";

const MANAGE_SERVER = String(PermissionFlagsBits.ManageGuild);

export function staffCommand<N extends string, D extends string>(name: N, description: D) {
    return makeSlashCommand(name, description)
        .default_member_permissions(MANAGE_SERVER)
        .contexts([InteractionContextType.Guild]);
}

export const commands: ReturnType<typeof staffCommand>[] = [];
