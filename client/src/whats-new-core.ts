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
 * Convert inline markdown (bold, code) in an already HTML-escaped string to HTML.
 * @param escaped - an HTML-escaped string containing inline markdown
 * @returns the string with inline markdown replaced by HTML tags
 */
function inlineMarkdown(escaped: string): string {
    let s = escaped.replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
    let isInUl = false;

    const closeUl = () => {
        if (!isInUl) {
            return;
        }

        out.push('</ul>');
        isInUl = false;
    };

    for (const line of lines) {
        const h3 = line.match(/^###\s+(.+)$/);
        if (h3) {
            closeUl();
            out.push(`<h3>${renderInline(h3[1]!.trim())}</h3>`);
            continue;
        }
        const h2 = line.match(/^##\s+(.+)$/);
        if (h2) {
            closeUl();
            out.push(`<h2>${renderInline(h2[1]!.trim())}</h2>`);
            continue;
        }
        const bullet = line.match(/^\s*-\s+(.+)$/);
        if (bullet) {
            if (!isInUl) {
                out.push('<ul>');
                isInUl = true;
            }
            out.push(`<li>${renderInline(bullet[1]!.trim())}</li>`);
            continue;
        }
        if (line.trim() === '') {
            closeUl();
            continue;
        }
        closeUl();
        out.push(`<p>${renderInline(line.trim())}</p>`);
    }
    closeUl();
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
