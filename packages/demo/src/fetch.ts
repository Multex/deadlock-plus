import { answerApiFault, type FaultSet } from "./faults";

/**
 * A Deadlock API path and what it answers with: a body sent as JSON, or a whole `Response` such as a server
 * error. A route that throws fails the request the way a dropped connection does. `respond` gets the full
 * request URL.
 */
export type ApiRoute = [pattern: RegExp, respond: (url: URL) => unknown];

type Fetch = typeof fetch;

const API_HOST = "api.deadlock-api.com";

/**
 * Wraps `real` so Deadlock API paths with a route are answered from the scenario; the first matching route
 * wins. Everything else, public art and game data included, still goes to the network. A Deadlock API path
 * under one of `faults` answers as the fault says, routed or not.
 */
export function createFetch(routes: readonly ApiRoute[], real: Fetch, faults?: FaultSet): Fetch {
    return (input, init) => {
        const address = input instanceof Request ? input.url : String(input);
        const url = new URL(address, globalThis.location?.href);
        const api = url.hostname === API_HOST;
        const answer = (): Promise<Response> => {
            const route = api ? routes.find(([pattern]) => pattern.test(url.pathname)) : undefined;
            if (!route) return real(input, init);
            return new Promise((resolve) => {
                const body = route[1](url);
                resolve(body instanceof Response ? body : Response.json(body));
            });
        };
        const fault = api ? faults?.api(url.pathname) : undefined;
        return fault ? answerApiFault(fault, answer) : answer();
    };
}
