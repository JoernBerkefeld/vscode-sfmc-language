/**
 * Ambient module declaration for prettier-plugin-sfmc.
 *
 * The plugin ships as plain ESM JavaScript without type definitions. We only
 * use it as an opaque Prettier plugin object passed to `prettier.format`, so a
 * minimal `Plugin` shape is sufficient.
 */
declare module 'prettier-plugin-sfmc' {
    import type { Plugin } from 'prettier';

    export const languages: Plugin['languages'];
    export const parsers: Plugin['parsers'];
    export const printers: Plugin['printers'];
    export const options: Plugin['options'];
    export const defaultOptions: Plugin['defaultOptions'];
}
