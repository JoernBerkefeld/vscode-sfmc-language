declare module 'ampscript-data' {
    export const FUNCTIONS: any[];
    export const functionLookup: Map<string, any>;
    export const functionNames: Set<string>;
    export const CANONICAL_FUNCTIONS: string[];
    export const FUNCTION_CANONICAL_MAP: Map<string, string>;
    export function isEmailExcluded(functionName: string): boolean;
    export const DEPRECATED_FUNCTIONS: any[];
    export const deprecatedFunctionLookup: Map<string, any>;
    export const AMPSCRIPT_KEYWORDS: any[];
    export const PERSONALIZATION_STRINGS: any[];
}

declare module 'ssjs-data' {
    export const SSJS_GLOBALS: any[];
    export const SSJS_GLOBALS_MAP: Record<string, any>;
    export const PLATFORM_METHODS: any[];
    export const PLATFORM_FUNCTIONS: any[];
    export const platformFunctionLookup: Map<string, any>;
    export const platformFunctionNames: Set<string>;
    export const CORE_LIBRARY_OBJECTS: any[];
    export const coreObjectNames: Set<string>;
    export const coreObjectLookup: Map<string, any>;
    export const HTTP_METHODS: any[];
    export const httpMethodNames: Set<string>;
    export const WSPROXY_METHODS: any[];
    export const wsproxyMethodNames: Set<string>;
    export const PLATFORM_VARIABLE_METHODS: any[];
    export const PLATFORM_RESPONSE_METHODS: any[];
    export const PLATFORM_REQUEST_METHODS: any[];
    export const PLATFORM_CLIENT_BROWSER_METHODS: any[];
    export const platformClientBrowserMethodNames: Set<string>;
    export const SCRIPT_UTIL_CONSTRUCTORS: any[];
    export const SCRIPT_UTIL_REQUEST_METHODS: any[];
    export const ECMASCRIPT_BUILTINS: any[];
    export const UNSUPPORTED_SYNTAX: any[];
    export const unsupportedByNodeType: Map<string, any>;
    export const POLYFILLABLE_METHODS: any[];
    export const polyfillByPrototypeName: Map<string, any>;
    export const polyfillByStaticName: Map<string, any>;
}
