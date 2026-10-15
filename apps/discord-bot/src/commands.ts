// `scripts/register.mjs` loads this file with Node's type stripping, which cannot resolve extensionless relative
// imports: import only packages here.
import { InteractionContextType, PermissionFlagsBits } from "discord-api-types/v10";
import { makeBooleanOption, makeNumberOption, makeSlashCommand, makeStringOption, makeSubCommand } from "discord-hono";

const MANAGE_SERVER = String(PermissionFlagsBits.ManageGuild);

export function staffCommand<N extends string, D extends string>(name: N, description: D) {
    return makeSlashCommand(name, description)
        .default_member_permissions(MANAGE_SERVER)
        .contexts([InteractionContextType.Guild]);
}

const day = (name: string, description: string) =>
    makeStringOption(name, `${description} (YYYY-MM-DD)`).min_length(10).max_length(10);
const costName = () => makeStringOption("name", "What is paid for, as the page shows it").max_length(80);
const purpose = () => makeStringOption("purpose", "Why Deadlock+ needs it").max_length(100);
const amount = () => makeNumberOption("amount", "Price per charge, in the list's currency").min_value(0);
const period = () =>
    makeStringOption("period", "How often it is charged").choices([
        { name: "Every month", value: "month" },
        { name: "Every year", value: "year" },
        { name: "Once", value: "once" },
    ]);
const pick = () => makeStringOption("cost", "The cost to change").required(true).autocomplete(true);

export const cost = staffCommand("cost", "The running costs shown on the transparency page").options([
    makeSubCommand("list", "Show every cost and the totals"),
    makeSubCommand("add", "Add a cost").options([
        costName().required(true),
        purpose().required(true),
        amount().required(true),
        period().required(true),
        day("since", "First charge").required(true),
        day("until", "First day with no charge"),
    ]),
    makeSubCommand("edit", "Change a cost").options([
        pick(),
        costName(),
        purpose(),
        amount(),
        period(),
        day("since", "First charge"),
        day("until", "First day with no charge"),
        makeBooleanOption("running", "Remove the end day, so the cost runs again"),
    ]),
    makeSubCommand("end", "Stop a running cost").options([
        pick(),
        day("until", "First day with no charge; today if empty"),
    ]),
]);

export const commands = [cost];
