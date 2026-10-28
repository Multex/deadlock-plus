import assert from "node:assert/strict";
import { test } from "node:test";
import { post } from "./send.mjs";

const WEBHOOK = "https://discord.com/api/webhooks/123/test-token-not-real";
const MESSAGES = [{ n: 1 }, { n: 2 }, { n: 3 }];

function ok() {
    return new Response(JSON.stringify({ id: "1" }), { status: 200 });
}

function limited(seconds) {
    return new Response(JSON.stringify({ message: "You are being rate limited.", retry_after: seconds }), {
        status: 429,
    });
}

/** A fake `fetch` that answers each call with the next response from `answers`, recording what it was sent. */
function fakeFetch(answers) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: new URL(url), body: JSON.parse(init.body), method: init.method });
        const next = answers.shift() ?? ok;
        return next();
    };
    return { fetch, calls };
}

const noSleep = async () => {};

test("posts every message in order with wait and components on", async () => {
    const { fetch, calls } = fakeFetch([]);
    await post(WEBHOOK, MESSAGES, { fetch, sleep: noSleep });
    assert.deepEqual(
        calls.map((c) => c.body.n),
        [1, 2, 3],
    );
    for (const { url, method } of calls) {
        assert.equal(method, "POST");
        assert.equal(url.searchParams.get("wait"), "true");
        assert.equal(url.searchParams.get("with_components"), "true");
        assert.equal(url.pathname, "/api/webhooks/123/test-token-not-real");
    }
});

test("waits for each message to be accepted before sending the next", async () => {
    let release;
    let inFlight = 0;
    let most = 0;
    const fetch = async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => (release = resolve));
        inFlight -= 1;
        return ok();
    };
    const done = post(WEBHOOK, MESSAGES, { fetch, sleep: noSleep });
    for (let i = 0; i < MESSAGES.length; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        release();
    }
    await done;
    assert.equal(most, 1);
});

test("a 429 waits out retry_after and sends the same message again", async () => {
    const { fetch, calls } = fakeFetch([ok, () => limited(1.5), ok, ok]);
    const slept = [];
    await post(WEBHOOK, MESSAGES, { fetch, sleep: async (ms) => slept.push(ms) });
    assert.deepEqual(
        calls.map((c) => c.body.n),
        [1, 2, 2, 3],
    );
    assert.deepEqual(slept, [1500]);
});

test("a 429 with only a Retry-After header waits that long", async () => {
    const headerOnly = () => new Response("", { status: 429, headers: { "retry-after": "2" } });
    const { fetch, calls } = fakeFetch([headerOnly, ok, ok, ok]);
    const slept = [];
    await post(WEBHOOK, MESSAGES, { fetch, sleep: async (ms) => slept.push(ms) });
    assert.equal(calls.length, 4);
    assert.deepEqual(slept, [2000]);
});

test("a failed message stops the post and says which part failed", async () => {
    const bad = () => new Response(JSON.stringify({ message: "Invalid Form Body" }), { status: 400 });
    const { fetch, calls } = fakeFetch([ok, bad]);
    await assert.rejects(post(WEBHOOK, MESSAGES, { fetch, sleep: noSleep }), (err) => {
        assert.match(err.message, /part 2 of 3/);
        assert.match(err.message, /400/);
        assert.match(err.message, /1 of 3 .*posted/);
        assert.doesNotMatch(err.message, /test-token-not-real/);
        return true;
    });
    assert.equal(calls.length, 2);
});

test("a message still rate limited after several tries fails the post", async () => {
    const { fetch, calls } = fakeFetch(Array.from({ length: 20 }, () => () => limited(0.1)));
    await assert.rejects(post(WEBHOOK, MESSAGES, { fetch, sleep: noSleep }), /part 1 of 3.*429/);
    assert.ok(calls.length > 1 && calls.length < 20, `tried ${calls.length} times`);
    assert.ok(calls.every((c) => c.body.n === 1));
});

test("a network error fails the post without sending later parts", async () => {
    const { fetch, calls } = fakeFetch([
        ok,
        () => {
            throw new TypeError("fetch failed");
        },
    ]);
    await assert.rejects(post(WEBHOOK, MESSAGES, { fetch, sleep: noSleep }), /part 2 of 3.*fetch failed/);
    assert.equal(calls.length, 2);
});
