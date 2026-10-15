// `scripts/register.mjs` loads this file with Node's type stripping, which cannot resolve extensionless relative
// imports: import only packages here.
import { ChannelType, InteractionContextType, PermissionFlagsBits } from "discord-api-types/v10";
import {
    makeBooleanOption,
    makeChannelOption,
    makeNumberOption,
    makeRoleOption,
    makeSlashCommand,
    makeStringOption,
    makeSubCommand,
} from "discord-hono";

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

const ref = (description: string) => makeStringOption("ref", description).max_length(32);
const pickRef = (description: string) => ref(description).required(true).autocomplete(true);

export const invite = staffCommand("invite", "The invite codes the website and the app link to").options([
    makeSubCommand("list", "Show every invite with its uses and landing paths"),
    makeSubCommand("stats", "Show joins per invite over the last day, week and month"),
    makeSubCommand("create", "Create a permanent invite and add it to the table").options([
        ref("Short name it is counted under, e.g. instagram").required(true),
        makeChannelOption("channel", "The channel the invite opens")
            .required(true)
            .channel_types([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        makeStringOption("kind", "How it is shared; web if empty").choices([
            { name: "Web: linked through the website", value: "web" },
            { name: "Direct: a discord.gg link posted as is", value: "direct" },
        ]),
    ]),
    makeSubCommand("edit", "Rename an invite or give it a code").options([
        pickRef("The invite to change"),
        makeStringOption("new_ref", "New name").max_length(32),
        makeStringOption("code", "An existing invite code or discord.gg link from this server").max_length(64),
    ]),
    makeSubCommand("delete", "Remove an invite from the table").options([
        pickRef("The invite to remove"),
        makeBooleanOption("revoke", "Also revoke it on Discord, so the link stops working"),
    ]),
]);

export const landing = staffCommand("landing", "Short paths typed after the site's address").options([
    makeSubCommand("add", "Add a path, e.g. ig for deadlockplus.app/ig").options([
        makeStringOption("path", "The path, without a slash").required(true).max_length(32),
        pickRef("The invite visitors on this path are counted under"),
    ]),
    makeSubCommand("delete", "Remove a path; it then lands on the home page").options([
        makeStringOption("path", "The path to remove").required(true).autocomplete(true),
    ]),
]);

export const announce = staffCommand("announce", "Post an announcement as the bot; the text is asked next").options([
    makeChannelOption("channel", "The channel to post in")
        .required(true)
        .channel_types([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
    makeRoleOption("role", "The only role the post mentions; nobody if empty"),
]);

export const commands = [cost, invite, landing, announce];
