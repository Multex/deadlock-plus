declare module "*.json?omit=dispatch" {
    const catalog: import("./i18n.svelte").Catalog;
    export default catalog;
}

declare module "*.json?pick=dispatch" {
    const catalog: import("./i18n.svelte").Catalog;
    export default catalog;
}
