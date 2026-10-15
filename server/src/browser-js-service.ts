/**
Document-local browser JavaScript intelligence, independent of the SSJS program.
 */
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getScriptRegions, type ScriptRegion } from 'sfmc-language-lsp';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CompletionItem,
    CompletionItemKind,
    Diagnostic,
    DiagnosticSeverity,
    Hover,
    Location,
    Position,
    Range,
    SignatureHelp,
} from 'vscode-languageserver/node';
/**
Entry declarations whose reference closure must be copied by packaging.
 */
export const BROWSER_LIBRARY_FILES = ['lib.es2024.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'];

interface Projection {
    name: string;
    text: string;
    region: ScriptRegion;
    templates: ts.TextSpan[];
}

interface BrowserDocument {
    document: TextDocument;
    projections: Projection[];
    service: ts.LanguageService;
}

/**
 * Load only standard library declarations and their local reference closure.
 * @param directory - Directory containing declarations from the bundled TypeScript version.
 * @returns Virtual declaration files keyed by basename.
 */
function loadLibraries(directory: string): Map<string, string> {
    const libraries = new Map<string, string>();
    const load = (name: string): void => {
        if (libraries.has(name)) return;
        if (!/^lib\.[\w.]+\.d\.ts$/.test(name)) throw new Error(`Invalid browser library: ${name}`);
        const text = readFileSync(path.join(directory, name), 'utf8');
        libraries.set(name, text);
        const references = ts.preProcessFile(text);
        for (const reference of references.libReferenceDirectives)
            load(`lib.${reference.fileName}.d.ts`);
        for (const reference of references.referencedFiles) load(reference.fileName);
    };
    for (const name of BROWSER_LIBRARY_FILES) load(name);
    return libraries;
}

/**
 * Mask code units without changing UTF-16 offsets or newline sequences.
 * @param text - Text to mask.
 * @returns Whitespace projection.
 */
function mask(text: string): string {
    return text.replaceAll(/[^\r\n]/g, ' ');
}

/**
 * Project one script, retaining safe quoted/comment interpolation only.
 * Unquoted template output can alter the JavaScript grammar; omit that script
 * rather than inventing a replacement expression or reporting false errors.
 * @param text - Full mixed document.
 * @param region - Classified browser script body.
 * @param name - Virtual script filename.
 * @returns A safe offset-preserving projection, or undefined for dynamic grammar.
 */
function project(text: string, region: ScriptRegion, name: string): Projection | undefined {
    const body = text.slice(region.bodyStart, region.bodyEnd);
    const templates: ts.TextSpan[] = [];
    const sanitized = body.replaceAll(
        /%%\[[\s\S]*?\]%%|%%=[\s\S]*?=%%|\{\{\{?[\s\S]*?\}\}\}?|\{!\$[^}]*\}/g,
        (match, offset: number) => {
            templates.push({ start: region.bodyStart + offset, length: match.length });
            return mask(match);
        }
    );
    // Incomplete template delimiters also belong to the template service.
    if (/%%\[|%%=|\{\{|\{!\$/.test(sanitized)) return undefined;
    const scanner = ts.createScanner(
        ts.ScriptTarget.Latest,
        false,
        ts.LanguageVariant.Standard,
        sanitized
    );
    const safeSpans: ts.TextSpan[] = [];
    for (
        let token = scanner.scan();
        token !== ts.SyntaxKind.EndOfFileToken;
        token = scanner.scan()
    ) {
        if (
            [
                ts.SyntaxKind.StringLiteral,
                ts.SyntaxKind.NoSubstitutionTemplateLiteral,
                ts.SyntaxKind.TemplateHead,
                ts.SyntaxKind.TemplateMiddle,
                ts.SyntaxKind.TemplateTail,
                ts.SyntaxKind.SingleLineCommentTrivia,
                ts.SyntaxKind.MultiLineCommentTrivia,
            ].includes(token)
        ) {
            safeSpans.push({
                start: region.bodyStart + scanner.getTokenPos(),
                length: scanner.getTextPos() - scanner.getTokenPos(),
            });
        }
    }
    return templates.some((span) =>
        safeSpans.every(
            (safe) =>
                !(span.start >= safe.start && span.start + span.length <= safe.start + safe.length)
        )
    )
        ? undefined
        : {
              name,
              region,
              templates,
              text:
                  mask(text.slice(0, region.bodyStart)) +
                  sanitized +
                  mask(text.slice(region.bodyEnd)),
          };
}

/**
 * Whether a TypeScript result belongs entirely to original browser code.
 * @param projection - Script projection.
 * @param span - TypeScript UTF-16 range.
 * @returns True for a region-local, non-template range.
 */
function isContained(projection: Projection, span: ts.TextSpan): boolean {
    const end = span.start + span.length;
    return (
        span.start >= projection.region.bodyStart &&
        (span.start < projection.region.bodyEnd ||
            (span.length === 0 && span.start === projection.region.bodyEnd)) &&
        end <= projection.region.bodyEnd &&
        projection.templates.every(
            (template) =>
                !(
                    (span.start < template.start + template.length && end > template.start) ||
                    (span.length === 0 &&
                        span.start >= template.start &&
                        span.start < template.start + template.length)
                )
        )
    );
}

/**
Isolated programs for open mixed documents; no workspace or external file lookup.
 */
export class BrowserJsService {
    private readonly libraries: Map<string, string>;
    private readonly documents = new Map<string, BrowserDocument>();

    /**
     * Use packaged declarations by default; development/tests explicitly supply installed TS libs.
     * Missing declarations fail visibly rather than silently losing browser intelligence.
     * @param libraryDirectory - Bundled declaration directory, relative to server/out by default.
     */
    constructor(libraryDirectory = path.join(__dirname, 'browser-libs')) {
        this.libraries = loadLibraries(libraryDirectory);
    }

    /**
     * Locate a safe browser cursor in its document-local program.
     * @param uri - Original document URI.
     * @param position - Original UTF-16 LSP position.
     * @returns Request context, or undefined outside browser ownership.
     */
    private context(uri: string, position: Position) {
        const state = this.documents.get(uri);
        if (!state) return;
        const offset = state.document.offsetAt(position);
        const projection = state.projections.find((candidate) =>
            isContained(candidate, { start: offset, length: 0 })
        );
        return projection ? { ...state, projection, offset } : undefined;
    }

    /**
     * Map a projected span to the original document.
     * @param document - Original document.
     * @param span - UTF-16 TypeScript span.
     * @returns Original LSP range.
     */
    private range(document: TextDocument, span: ts.TextSpan): Range {
        return Range.create(
            document.positionAt(span.start),
            document.positionAt(span.start + span.length)
        );
    }

    /**
     * Map navigation results while rejecting masked and declaration-library targets.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @param isReferences - Whether to request references instead of definitions.
     * @returns Safe source locations.
     */
    private locations(uri: string, position: Position, isReferences: boolean): Location[] {
        const context = this.context(uri, position);
        if (!context) return [];
        const entries = isReferences
            ? context.service.getReferencesAtPosition(context.projection.name, context.offset)
            : context.service.getDefinitionAtPosition(context.projection.name, context.offset);
        return (entries ?? []).flatMap((entry) => {
            const target = context.projections.find(
                (projection) => projection.name === entry.fileName
            );
            return target && isContained(target, entry.textSpan)
                ? { uri, range: this.range(context.document, entry.textSpan) }
                : [];
        });
    }

    /**
     * Replace a document's projections and dispose its old program.
     * @param uri - Original document URI.
     * @param text - Full mixed document text, never a pre-extracted SSJS projection.
     */
    updateDocument(uri: string, text: string): void {
        this.removeDocument(uri);
        const projections = getScriptRegions(text)
            .filter(
                (region) => region.kind === 'browser-classic' || region.kind === 'browser-module'
            )
            .map((region, index) =>
                project(
                    text,
                    region,
                    `script-${index}.${region.kind === 'browser-module' ? 'mjs' : 'js'}`
                )
            )
            .filter((projection): projection is Projection => projection !== undefined);
        if (projections.length === 0) return;
        const files = new Map(this.libraries);
        for (const projection of projections) files.set(projection.name, projection.text);
        const host: ts.LanguageServiceHost = {
            getCompilationSettings: () => ({
                allowJs: true,
                checkJs: false,
                strict: false,
                noEmit: true,
                target: ts.ScriptTarget.ES2024,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                lib: BROWSER_LIBRARY_FILES,
                skipLibCheck: true,
                types: [],
            }),
            getScriptFileNames: () => [...files].map(([name]) => name),
            getScriptVersion: () => '1',
            getScriptSnapshot: (name) => {
                const content = files.get(path.basename(name));
                return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
            },
            getCurrentDirectory: () => '/',
            getDefaultLibFileName: () => BROWSER_LIBRARY_FILES[0],
            fileExists: (name) => files.has(path.basename(name)),
            readFile: (name) => files.get(path.basename(name)),
            readDirectory: () => [],
            resolveModuleNames: (names) => Array.from<undefined>({ length: names.length }),
        };
        this.documents.set(uri, {
            document: TextDocument.create(uri, 'javascript', 1, text),
            projections,
            service: ts.createLanguageService(host),
        });
    }

    /**
     * Dispose a closed document or one that lost browser script regions.
     * @param uri - Original document URI.
     */
    removeDocument(uri: string): void {
        this.documents.get(uri)?.service.dispose();
        this.documents.delete(uri);
    }

    /**
    Dispose all document programs.
     */
    dispose(): void {
        for (const uri of this.documents.keys()) this.removeDocument(uri);
    }

    /**
     * Return browser completions without external auto-import edits.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @returns Region-local completion items.
     */
    getCompletions(uri: string, position: Position): CompletionItem[] {
        const context = this.context(uri, position);
        if (!context) return [];
        const { service, projection, offset, document } = context;
        const info = service.getCompletionsAtPosition(projection.name, offset, {
            includeCompletionsForModuleExports: false,
            includeCompletionsWithInsertText: true,
        });
        return (info?.entries ?? [])
            .filter(
                (entry) =>
                    !entry.hasAction &&
                    (!entry.replacementSpan || isContained(projection, entry.replacementSpan))
            )
            .map((entry) => ({
                label: entry.name,
                kind:
                    (
                        {
                            [ts.ScriptElementKind.memberFunctionElement]: CompletionItemKind.Method,
                            [ts.ScriptElementKind.functionElement]: CompletionItemKind.Function,
                        } as Record<string, CompletionItemKind>
                    )[entry.kind] ?? CompletionItemKind.Text,
                sortText: entry.sortText,
                insertText: entry.insertText,
                textEdit: entry.replacementSpan
                    ? {
                          range: this.range(document, entry.replacementSpan),
                          newText: entry.insertText ?? entry.name,
                      }
                    : undefined,
            }));
    }

    /**
     * Return TypeScript hover in original coordinates.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @returns Browser hover, if present.
     */
    getHover(uri: string, position: Position): Hover | undefined {
        const context = this.context(uri, position);
        if (!context) return undefined;
        const info = context.service.getQuickInfoAtPosition(
            context.projection.name,
            context.offset
        );
        return !info || !isContained(context.projection, info.textSpan)
            ? undefined
            : {
                  contents: {
                      kind: 'markdown',
                      value:
                          '```typescript\n' +
                          ts.displayPartsToString(info.displayParts) +
                          '\n```\n' +
                          ts.displayPartsToString(info.documentation),
                  },
                  range: this.range(context.document, info.textSpan),
              };
    }

    /**
     * Return signatures for a browser call.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @returns Signature help, if present.
     */
    getSignatureHelp(uri: string, position: Position): SignatureHelp | undefined {
        const context = this.context(uri, position);
        if (!context) return undefined;
        const info = context.service.getSignatureHelpItems(
            context.projection.name,
            context.offset,
            {}
        );
        return info
            ? {
                  activeSignature: info.selectedItemIndex,
                  activeParameter: info.argumentIndex,
                  signatures: info.items.map((item) => ({
                      label:
                          ts.displayPartsToString(item.prefixDisplayParts) +
                          item.parameters
                              .map((parameter) => ts.displayPartsToString(parameter.displayParts))
                              .join(ts.displayPartsToString(item.separatorDisplayParts)) +
                          ts.displayPartsToString(item.suffixDisplayParts),
                      documentation: ts.displayPartsToString(item.documentation),
                      parameters: item.parameters.map((parameter) => ({
                          label: ts.displayPartsToString(parameter.displayParts),
                          documentation: ts.displayPartsToString(parameter.documentation),
                      })),
                  })),
              }
            : undefined;
    }

    /**
     * Resolve only source definitions in this document, not bundled libraries.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @returns Document-local definitions.
     */
    getDefinition(uri: string, position: Position): Location[] {
        return this.locations(uri, position, false);
    }

    /**
     * Find references only in this document's browser scripts.
     * @param uri - Original document URI.
     * @param position - Original position.
     * @returns Document-local isReferences, including declarations.
     */
    getReferences(uri: string, position: Position): Location[] {
        return this.locations(uri, position, true);
    }

    /**
     * Return syntax and opt-in checked-JS diagnostics at original positions.
     * @param uri - Original document URI.
     * @returns Browser diagnostics, excluding masked/template content.
     */
    getDiagnostics(uri: string): Diagnostic[] {
        const state = this.documents.get(uri);
        if (!state) return [];
        return state.projections.flatMap((projection) =>
            [
                ...state.service.getSyntacticDiagnostics(projection.name),
                ...state.service.getSemanticDiagnostics(projection.name),
            ].flatMap((diagnostic) => {
                if (diagnostic.start === undefined) return [];
                const span = {
                    start:
                        diagnostic.start === projection.text.length && diagnostic.length === 0
                            ? projection.region.bodyEnd
                            : diagnostic.start,
                    length: diagnostic.length ?? 0,
                };
                if (!isContained(projection, span)) return [];
                return {
                    range: this.range(state.document, span),
                    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                    severity:
                        diagnostic.category === ts.DiagnosticCategory.Error
                            ? DiagnosticSeverity.Error
                            : DiagnosticSeverity.Warning,
                    source: 'javascript',
                };
            })
        );
    }
}
