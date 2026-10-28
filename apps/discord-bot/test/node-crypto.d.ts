// The Worker's types leave Node out; tests check signatures with Node's own Ed25519 as an outside verifier.
declare module "node:crypto" {
    export type KeyObject = { readonly type: "public" };
    export function createPublicKey(options: { key: Uint8Array; format: "der"; type: "spki" }): KeyObject;
    export function verify(algorithm: null, data: Uint8Array, key: KeyObject, signature: Uint8Array): boolean;
}
