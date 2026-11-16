/**
 * SSJS member completion for the server: finds the receiver in front of the
 * cursor's dot and hands it to the shared rule of `sfmc-language-lsp/typescript`.
 */
import type { CompletionItem } from 'vscode-languageserver/node';
import { memberCompletions, type SsjsCompletionInfo } from 'sfmc-language-lsp/typescript';

// Dotted identifiers, the member's dot and what is typed of the member so far.
const RECEIVER_CHAIN = /((?:[\w$]+\s*\.\s*)*[\w$]+)\s*\.\s*[\w$]*$/;

/**
 * Find the dotted expression in front of the last dot before the cursor.
 * @param textBeforeCursor - the cursor's line up to the cursor
 * @returns the receiver (empty if it is not a plain dotted name) and whether `new` precedes it
 */
export function ssjsMemberReceiver(textBeforeCursor: string): {
    receiver: string;
    hasNew: boolean;
} {
    const match = RECEIVER_CHAIN.exec(textBeforeCursor);
    if (!match) return { receiver: '', hasNew: false };
    const before = textBeforeCursor.slice(0, match.index);
    // `a().b.` and `a[0].b.`: the name is a member of a value, not a global the catalogue describes
    return /[.)\]]\s*$/.test(before)
        ? { receiver: '', hasNew: false }
        : { receiver: match[1], hasNew: /\bnew\s+$/.test(before) };
}

/**
 * The completions after a member access in SSJS: TypeScript's members, described
 * by the catalogue where it knows them.
 * @param textBeforeCursor - the cursor's line up to the cursor
 * @param typescript - what the TypeScript service offers at the cursor
 * @param catalogueItems - the SFMC catalogue's SSJS completions
 * @returns the members (none for an unknown receiver), or undefined when the cursor is not at a member access
 */
export function ssjsMemberCompletions(
    textBeforeCursor: string,
    typescript: SsjsCompletionInfo,
    catalogueItems: readonly CompletionItem[]
): CompletionItem[] | undefined {
    // Text-based dot-access detection — catches edge cases where TypeScript's
    // isMemberCompletion is false despite a trailing dot.
    const isMemberAccess = typescript.isMemberCompletion || /\.\s*$/.test(textBeforeCursor);
    if (!isMemberAccess) return undefined;
    return (
        memberCompletions({
            typescriptItems: typescript.items,
            isMemberAccess,
            catalogueItems,
            ...ssjsMemberReceiver(textBeforeCursor),
        }) ?? []
    );
}
