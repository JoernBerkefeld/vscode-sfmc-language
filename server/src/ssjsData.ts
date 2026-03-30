/**
 * SSJS language data for the language server.
 *
 * Re-exports SSJS function/object metadata from ssjs-data (the single
 * source of truth) into formats suitable for LSP completions, hover,
 * and diagnostics. No hand-maintained copies — updates to ssjs-data
 * propagate automatically.
 */

import {
    PLATFORM_METHODS,
    PLATFORM_FUNCTIONS,
    SSJS_GLOBALS,
    PLATFORM_VARIABLE_METHODS,
    PLATFORM_RESPONSE_METHODS,
    PLATFORM_REQUEST_METHODS,
    PLATFORM_CLIENT_BROWSER_METHODS,
    CORE_LIBRARY_OBJECTS,
    WSPROXY_METHODS,
    HTTP_METHODS,
    SCRIPT_UTIL_CONSTRUCTORS,
    SCRIPT_UTIL_REQUEST_METHODS,
    ECMASCRIPT_BUILTINS,
} from 'ssjs-data';

export interface SsjsFunctionParam {
    name: string;
    description: string;
    type?: string;
    optional?: boolean;
}

export interface SsjsFunction {
    name: string;
    minArgs: number;
    maxArgs: number;
    description: string;
    prefix?: string;
    params?: SsjsFunctionParam[];
    returnType?: string;
    syntax?: string;
    example?: string;
}

export interface EcmascriptBuiltin {
    name: string;
    owner: string;
    description: string;
    params?: SsjsFunctionParam[];
    returnType?: string;
    syntax?: string;
    example?: string;
}

export interface SsjsObject {
    name: string;
    methods: string[];
    description: string;
}

// ── Top-level Platform methods ───────────────────────────────────────────────

export const platformMethods: SsjsFunction[] = PLATFORM_METHODS.map((m) => ({
    ...m,
    prefix: 'Platform',
}));

// ── Platform.Function methods ────────────────────────────────────────────────

export const platformFunctions: SsjsFunction[] = PLATFORM_FUNCTIONS.map((f) => ({
    ...f,
    prefix: 'Platform.Function',
}));

export const platformFunctionLookup = new Map<string, SsjsFunction>(
    platformFunctions.map((f) => [f.name.toLowerCase(), f]),
);

// ── Global functions ─────────────────────────────────────────────────────────

export const ssjsGlobals: SsjsFunction[] = SSJS_GLOBALS.filter((g) => g.type === 'function').map(
    (g) => ({
        name: g.name,
        minArgs: (g as any).minArgs ?? 1,
        maxArgs: (g as any).maxArgs ?? 1,
        description: g.description,
        ...((g as any).params && { params: (g as any).params }),
        ...((g as any).returnType && { returnType: (g as any).returnType }),
        ...((g as any).syntax && { syntax: (g as any).syntax }),
    }),
);

// ── Variable/Response/Request objects ────────────────────────────────────────

export const platformVariableMethods: SsjsFunction[] = PLATFORM_VARIABLE_METHODS.map((m) => ({
    ...m,
    prefix: 'Platform.Variable',
}));

export const platformResponseMethods: SsjsFunction[] = PLATFORM_RESPONSE_METHODS.map((m) => ({
    ...m,
    prefix: 'Platform.Response',
}));

export const platformRequestMethods: SsjsFunction[] = PLATFORM_REQUEST_METHODS.map((m) => ({
    ...m,
    prefix: 'Platform.Request',
}));

// ── Core library objects ─────────────────────────────────────────────────────

export const coreLibraryObjects: SsjsObject[] = CORE_LIBRARY_OBJECTS.map((o) => ({
    name: o.name,
    methods: o.methods,
    description: o.description,
}));

// ── WSProxy methods ──────────────────────────────────────────────────────────

export const wsproxyMethods: SsjsFunction[] = WSPROXY_METHODS.map((m) => ({
    ...m,
    prefix: 'WSProxy',
}));

// ── HTTP methods ─────────────────────────────────────────────────────────────

export const httpMethods: SsjsFunction[] = HTTP_METHODS.map((m) => ({
    ...m,
    prefix: 'HTTP',
}));

// ── Platform.ClientBrowser methods ───────────────────────────────────────────

export const platformClientBrowserMethods: SsjsFunction[] = PLATFORM_CLIENT_BROWSER_METHODS.map(
    (m) => ({
        ...m,
        prefix: 'Platform.ClientBrowser',
    }),
);

// ── Script.Util constructors ─────────────────────────────────────────────────

export const scriptUtilConstructors: SsjsFunction[] = SCRIPT_UTIL_CONSTRUCTORS.map((c: any) => ({
    ...c,
    prefix: 'Script.Util',
}));

// ── Script.Util request methods ──────────────────────────────────────────────

export const scriptUtilRequestMethods: SsjsFunction[] = SCRIPT_UTIL_REQUEST_METHODS.map((m: any) => ({
    ...m,
    prefix: 'req',
}));

// ── ECMAScript 3/5 built-in methods ──────────────────────────────────────────

export const ecmascriptBuiltins: EcmascriptBuiltin[] = ECMASCRIPT_BUILTINS as EcmascriptBuiltin[];
