/**
 * Changelog parsing and minimal markdown HTML (no vscode dependency — safe for Node unit tests).
 */

/**
 * Compare semver strings (numeric segments only). Returns positive if a > b.
 * @param a - first version string
 * @param b - second version string
 * @returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareSemver(a: string, b: string): number {
    const pa = a.split('.').map((p) => Number(p) || 0);
    const pb = b.split('.').map((p) => Number(p) || 0);
    const length = Math.max(pa.length, pb.length);
    for (let index = 0; index < length; index++) {
        const da = pa[index] ?? 0;
        const database = pb[index] ?? 0;
        if (da > database) return 1;
        if (da < database) return -1;
    }
    return 0;
}

/**
 * Extract the changelog body for a given version (Keep a Changelog style: ## [x.y.z]).
 * @param changelog - full CHANGELOG.md content
 * @param version - semver version string to look up
 * @returns the changelog body for that version, or undefined if not found
 */
export function parseChangelogEntry(changelog: string, version: string): string | undefined {
    const escaped = version.replaceAll(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
    const re = new RegExp(String.raw`^## \[${escaped}\]` + String.raw`[^\n]*\n`, 'm');
    const match = changelog.match(re);
    if (!match || match.index === undefined) {
        return undefined;
    }
    const start = match.index + match[0].length;
    const rest = changelog.slice(start);
    const nextIndex = rest.search(/^## \[/m);
    const body = nextIndex === -1 ? rest : rest.slice(0, nextIndex);
    return body.trim();
}

/**
 * Escape HTML-special characters so a raw string can be embedded in markup.
 * @param s - the raw string to escape
 * @returns the HTML-escaped string
 */
export function escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Determine whether a URL uses a safe scheme (http(s) or mailto) for anchor generation.
 * @param url - the URL to test
 * @returns true when the URL is safe to turn into an anchor
 */
function isSafeUrl(url: string): boolean {
    return /^(https?:\/\/|mailto:)/i.test(url);
}

/**
 * Convert inline markdown (links, bold, code) in an already HTML-escaped string to HTML.
 * @param escaped - an HTML-escaped string containing inline markdown
 * @returns the string with inline markdown replaced by HTML tags
 */
function inlineMarkdown(escaped: string): string {
    // [text](url) → anchor. Runs on already-escaped text, so "&" in URLs is "&amp;"
    // (harmless in href). Only safe schemes become links; others stay as literal text.
    let s = escaped.replaceAll(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, url: string) =>
        isSafeUrl(url) ? `<a href="${url}">${text}</a>` : match
    );
    s = s.replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replaceAll(/`([^`]+)`/g, '<code>$1</code>');
    return s;
}

/**
 * Escape then apply inline markdown to a raw string in one step.
 * @param text - the raw string to escape and render
 * @returns the HTML-escaped string with inline markdown applied
 */
function renderInline(text: string): string {
    return inlineMarkdown(escapeHtml(text));
}

/**
 * Render a single markdown chunk (paragraphs and unordered lists) to HTML.
 * @param chunk - the markdown chunk to render
 * @returns the rendered HTML for that chunk
 */
function renderMarkdownChunk(chunk: string): string {
    const lines = chunk.split(/\r?\n/);
    const out: string[] = [];
    // Indentation (in spaces) of each currently-open <ul>, outermost first.
    const listIndents: number[] = [];

    const closeLists = (toDepth: number) => {
        while (listIndents.length > toDepth) {
            out.push('</ul>');
            listIndents.pop();
        }
    };

    for (const line of lines) {
        const h3 = line.match(/^###\s+(.+)$/);
        if (h3) {
            closeLists(0);
            out.push(`<h3>${renderInline(h3[1]!.trim())}</h3>`);
            continue;
        }
        const h2 = line.match(/^##\s+(.+)$/);
        if (h2) {
            closeLists(0);
            out.push(`<h2>${renderInline(h2[1]!.trim())}</h2>`);
            continue;
        }
        const bullet = line.match(/^(\s*)-\s+(.+)$/);
        if (bullet) {
            const indent = bullet[1]!.replaceAll('\t', '  ').length;
            // Open a deeper list only when this bullet is indented past the current level;
            // close lists back to the matching level when it dedents.
            if (listIndents.length === 0 || indent > listIndents.at(-1)!) {
                out.push('<ul>');
                listIndents.push(indent);
            } else {
                while (listIndents.length > 1 && indent < listIndents.at(-1)!) {
                    out.push('</ul>');
                    listIndents.pop();
                }
            }
            out.push(`<li>${renderInline(bullet[2]!.trim())}</li>`);
            continue;
        }
        if (line.trim() === '') {
            closeLists(0);
            continue;
        }
        closeLists(0);
        out.push(`<p>${renderInline(line.trim())}</p>`);
    }
    closeLists(0);
    return out.join('');
}

/**
 * Minimal markdown → HTML for changelog sections (headings, lists, bold, code).
 * @param md - markdown string to convert
 * @returns HTML string
 */
export function markdownToHtml(md: string): string {
    const parts: string[] = [];
    const fence = /^```(\w*)\r?\n([\s\S]*?)^```$/gm;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = fence.exec(md)) !== null) {
        if (m.index > last) {
            parts.push(renderMarkdownChunk(md.slice(last, m.index)));
        }
        const code = escapeHtml(m[2] ?? '');
        const lang = m[1] ? ` class="language-${escapeHtml(m[1])}"` : '';
        parts.push(`<pre><code${lang}>${code}</code></pre>`);
        last = m.index + m[0].length;
    }
    if (last < md.length) {
        parts.push(renderMarkdownChunk(md.slice(last)));
    }
    return parts.join('');
}
