import * as fs from 'fs';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import {
    findReferenceMatches,
    iconForFile,
    languageForFile,
    parseReference,
    referenceHref,
    resolveReference,
    ResolvedReference,
} from './reference';

interface MarkdownEnvironment {
    currentDocument?: { fsPath?: string; scheme?: string };
}

export interface MarkdownReferencePluginOptions {
    workspaceRootForDocument?: (documentPath: string) => string | undefined;
    fileIconForPath?: (filePath: string, isDirectory: boolean) => { dataUri: string } | undefined;
    symbolIconForReference?: (
        filePath: string,
        symbol: string
    ) => { codicon: string; color: string } | undefined;
}

const iconClasses = {
    archive: 'codicon-file-zip',
    code: 'codicon-file-code',
    database: 'codicon-database',
    folder: 'codicon-folder',
    image: 'codicon-file-media',
    json: 'codicon-json',
    markdown: 'codicon-markdown',
    text: 'codicon-file-text',
} as const;

export function installMarkdownReferencePlugin(
    markdown: MarkdownIt,
    pluginOptions: MarkdownReferencePluginOptions = {}
): MarkdownIt {
    const originalTextRule = markdown.renderer.rules.text;
    const originalCodeRule = markdown.renderer.rules.code_inline;

    markdown.renderer.rules.text = (tokens, index, options, env: MarkdownEnvironment, renderer) => {
        if (isInsideLink(tokens, index)) {
            return originalTextRule
                ? originalTextRule(tokens, index, options, env, renderer)
                : markdown.utils.escapeHtml(tokens[index].content);
        }
        const rendered = renderTextReferences(tokens[index].content, env, markdown, pluginOptions);
        if (rendered !== undefined) return rendered;
        return originalTextRule
            ? originalTextRule(tokens, index, options, env, renderer)
            : markdown.utils.escapeHtml(tokens[index].content);
    };

    markdown.renderer.rules.code_inline = (tokens, index, options, env: MarkdownEnvironment, renderer) => {
        const rendered = renderExactReference(tokens[index].content, env, markdown, pluginOptions);
        if (rendered !== undefined) return rendered;
        if (originalCodeRule) return originalCodeRule(tokens, index, options, env, renderer);
        return `<code>${markdown.utils.escapeHtml(tokens[index].content.replace(/\n/g, ' '))}</code>`;
    };

    return markdown;
}

function renderTextReferences(
    text: string,
    env: MarkdownEnvironment,
    markdown: MarkdownIt,
    pluginOptions: MarkdownReferencePluginOptions
): string | undefined {
    const matches = findReferenceMatches(text);
    if (!matches.length) return undefined;

    let output = '';
    let cursor = 0;
    let transformed = false;
    for (const match of matches) {
        output += markdown.utils.escapeHtml(text.slice(cursor, match.index));
        const rendered = renderExactReference(match.value, env, markdown, pluginOptions);
        if (rendered === undefined) {
            output += markdown.utils.escapeHtml(match.value);
        } else {
            output += rendered;
            transformed = true;
        }
        cursor = match.index + match.length;
    }
    output += markdown.utils.escapeHtml(text.slice(cursor));
    return transformed ? output : undefined;
}

function renderExactReference(
    value: string,
    env: MarkdownEnvironment,
    markdown: MarkdownIt,
    pluginOptions: MarkdownReferencePluginOptions
): string | undefined {
    const documentPath = env.currentDocument?.scheme === 'file'
        ? env.currentDocument.fsPath
        : undefined;
    if (!documentPath) return undefined;

    const parsed = parseReference(value);
    if (!parsed) return undefined;
    const workspaceRoot = pluginOptions.workspaceRootForDocument?.(documentPath);
    const resolved = resolveReference(parsed, documentPath, workspaceRoot);
    if (!resolved) return undefined;

    return resolved.preview && !resolved.isDirectory
        ? renderPreview(resolved, documentPath, markdown, pluginOptions)
        : renderLink(resolved, documentPath, markdown, pluginOptions);
}

function renderLink(
    reference: ResolvedReference,
    documentPath: string,
    markdown: MarkdownIt,
    pluginOptions: MarkdownReferencePluginOptions
): string {
    const icon = iconForFile(reference.absolutePath, reference.isDirectory);
    const displayPath = markdown.utils.escapeHtml(
        reference.symbol ? reference.filePath.split(/[\\/]/).at(-1) ?? reference.filePath : reference.filePath
    );
    const href = markdown.utils.escapeHtml(referenceHref(reference, documentPath));
    const title = markdown.utils.escapeHtml(reference.absolutePath);
    const range = reference.startLine
        ? `<span class="md-ref__range">L${reference.startLine}${reference.endLine !== reference.startLine ? `-${reference.endLine}` : ''}</span>`
        : '';
    const symbol = reference.symbol
        ? `<span class="md-ref__symbol">#${markdown.utils.escapeHtml(reference.symbol)}</span>`
        : '';
    const symbolIcon = reference.symbol
        ? pluginOptions.symbolIconForReference?.(reference.absolutePath, reference.symbol)
        : undefined;
    const themedIcon = reference.symbol
        ? undefined
        : pluginOptions.fileIconForPath?.(reference.absolutePath, reference.isDirectory);
    const iconMarkup = symbolIcon
        ? `<span class="codicon ${markdown.utils.escapeHtml(symbolIcon.codicon)} md-ref__icon md-ref__symbol-icon md-ref__symbol-icon--${markdown.utils.escapeHtml(symbolIcon.color)}" aria-hidden="true"></span>`
        : themedIcon
            ? `<img class="md-ref__icon md-ref__theme-icon" src="${markdown.utils.escapeHtml(themedIcon.dataUri)}" alt="">`
            : `<span class="codicon ${iconClasses[icon]} md-ref__icon" aria-hidden="true"></span>`;
    const linkKind = reference.symbol ? ' md-ref--symbol' : '';
    return `<a class="md-ref md-ref--${icon}${linkKind}" href="${href}" data-href="${href}" title="${title}">`
        + iconMarkup
        + `<span class="md-ref__label"><span class="md-ref__path">${displayPath}</span>${symbol}</span>${range}</a>`;
}

function renderPreview(
    reference: ResolvedReference,
    documentPath: string,
    markdown: MarkdownIt,
    pluginOptions: MarkdownReferencePluginOptions
): string {
    const link = renderLink(reference, documentPath, markdown, pluginOptions);
    const source = readPreviewSource(reference);
    if (!source) {
        return `<span class="md-ref-preview">`
            + `<span class="md-ref-preview__header">${link}</span>`
            + `<span class="md-ref-preview__message">This file cannot be previewed.</span></span>`;
    }

    const language = languageForFile(reference.absolutePath);
    let code = markdown.utils.escapeHtml(source.content);
    if (language && typeof markdown.options.highlight === 'function') {
        try {
            code = markdown.options.highlight(source.content, language, '') || code;
        } catch {
            // Fall back to escaped source when a grammar rejects the snippet.
        }
    }
    const languageClass = language
        ? ` language-${markdown.utils.escapeHtml(language)}`
        : '';
    const lineLabel = source.startLine === source.endLine
        ? `Line ${source.startLine}`
        : `Lines ${source.startLine}-${source.endLine}`;

    return `<span class="md-ref-preview">`
        + `<span class="md-ref-preview__header">${link}`
        + `<span class="md-ref-preview__meta">${lineLabel}</span></span>`
        + `<code class="hljs md-ref-preview__code${languageClass}">${code}</code></span>`;
}

interface PreviewSource {
    content: string;
    startLine: number;
    endLine: number;
}

function readPreviewSource(reference: ResolvedReference): PreviewSource | undefined {
    try {
        const stat = fs.statSync(reference.absolutePath);
        if (stat.size > 1024 * 1024) return undefined;
        const content = fs.readFileSync(reference.absolutePath, 'utf8');
        if (content.includes('\0')) return undefined;
        const lines = content.replace(/\r\n?/g, '\n').split('\n');
        const startLine = reference.startLine ?? 1;
        if (startLine > lines.length) return undefined;
        const requestedEnd = reference.endLine ?? Math.min(lines.length, startLine + 199);
        const endLine = Math.min(requestedEnd, lines.length);
        return {
            content: lines.slice(startLine - 1, endLine).join('\n'),
            startLine,
            endLine,
        };
    } catch {
        return undefined;
    }
}

function isInsideLink(tokens: Token[], index: number): boolean {
    let linkDepth = 0;
    for (let i = 0; i < index; i++) {
        if (tokens[i].type === 'link_open') linkDepth++;
        if (tokens[i].type === 'link_close') linkDepth--;
    }
    return linkDepth > 0;
}
