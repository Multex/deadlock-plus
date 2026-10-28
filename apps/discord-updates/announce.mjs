import { render } from "./render.mjs";
import { post } from "./send.mjs";

const { DISCORD_UPDATES_WEBHOOK, RELEASE_TAG, RELEASE_URL, RELEASE_BODY } = process.env;

if (!DISCORD_UPDATES_WEBHOOK || !RELEASE_TAG || !RELEASE_URL) {
    console.error("DISCORD_UPDATES_WEBHOOK, RELEASE_TAG and RELEASE_URL are required");
    process.exit(1);
}

const messages = render({ tag: RELEASE_TAG, url: RELEASE_URL, notes: RELEASE_BODY ?? "" });

try {
    await post(DISCORD_UPDATES_WEBHOOK, messages);
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
console.log(`Announced ${RELEASE_TAG} in ${messages.length} message${messages.length === 1 ? "" : "s"}`);
