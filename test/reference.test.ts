import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMarkdownReferencePlugin } from '../src/markdownPlugin';
import {
    findReferenceMatches,
    parseReference,
    referenceHref,
    resolveReference,
} from '../src/reference';

describe('file reference parsing', () => {
    it('parses paths, ranges, and preview flags', () => {
        expect(parseReference('src/example.ts')).toMatchObject({
            filePath: 'src/example.ts',
            preview: false,
        });
        expect(parseReference('src/example.ts:300-330?preview=true')).toEqual({
            raw: 'src/example.ts:300-330?preview=true',
            filePath: 'src/example.ts',
            startLine: 300,
            endLine: 330,
            symbol: undefined,
            preview: true,
        });
        expect(parseReference('src/example.ts#User.email')).toMatchObject({
            filePath: 'src/example.ts',
            symbol: 'User.email',
        });
        expect(parseReference('src/example.ts:0-2')).toBeUndefined();
        expect(parseReference('https://example.com/file.ts')).toBeUndefined();
    });

    it('finds bare references without swallowing sentence punctuation', () => {
        const text = 'See src/example.ts:2-3, README.md and src/example.ts#User.email.';
        expect(findReferenceMatches(text).map(match => match.value)).toEqual([
            'src/example.ts:2-3',
            'README.md',
            'src/example.ts#User.email',
        ]);
    });
});

describe('reference resolution and rendering', () => {
    let root: string;
    let markdownPath: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reference-'));
        fs.mkdirSync(path.join(root, 'docs'));
        fs.mkdirSync(path.join(root, 'src'));
        markdownPath = path.join(root, 'docs', 'README.md');
        fs.writeFileSync(markdownPath, '# Demo\n');
        fs.writeFileSync(
            path.join(root, 'src', 'example.ts'),
            ['const escaped = "<safe>";', 'export function add(a: number, b: number) {', '    return a + b;', '}'].join('\n')
        );
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('falls back to the workspace root and creates a VS Code line fragment', () => {
        const parsed = parseReference('src/example.ts:2-3')!;
        const resolved = resolveReference(parsed, markdownPath, root)!;
        expect(resolved.absolutePath).toBe(path.join(root, 'src', 'example.ts'));
        expect(referenceHref(resolved, markdownPath)).toBe('../src/example.ts#L2-L3');
    });

    it('renders existing bare and inline-code references as links', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            workspaceRootForDocument: () => root,
        });
        const env = { currentDocument: { scheme: 'file', fsPath: markdownPath } };
        const html = markdown.render('See src/example.ts:2-3 and `src/example.ts`.', env);
        expect(html.match(/class="md-ref /g)).toHaveLength(2);
        expect(html).toContain('codicon-file-code');
        expect(html).toContain('#L2-L3');
        expect(html).toContain('data-href="../src/example.ts#L2-L3"');
    });

    it('renders preview source, metadata, and escaped file content', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            workspaceRootForDocument: () => root,
        });
        const env = { currentDocument: { scheme: 'file', fsPath: markdownPath } };
        const html = markdown.render('`src/example.ts:1-2?preview=true`', env);
        expect(html).toContain('md-ref-preview');
        expect(html).toContain('Lines 1-2');
        expect(html).toContain('&lt;safe&gt;');
        expect(html).not.toContain('?preview=true</span>');
    });

    it('renders symbol references through the extension URI handler', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            workspaceRootForDocument: () => root,
            fileIconForPath: () => ({ dataUri: 'data:image/svg+xml;base64,PHN2Zy8+' }),
            symbolIconForReference: () => ({
                codicon: 'codicon-symbol-method',
                color: 'method',
            }),
        });
        const env = { currentDocument: { scheme: 'file', fsPath: markdownPath } };
        const html = markdown.render('`src/example.ts#add`', env);
        expect(html).toContain('vscode://r0kuko.vscode-markdown-reference/open-symbol?');
        expect(html).toContain('symbol=add');
        expect(html).toContain('md-ref__symbol">#add');
        expect(html).toContain('<span class="md-ref__path">example.ts</span><span class="md-ref__symbol">#add</span>');
        expect(html).not.toContain('<span class="md-ref__path">src/example.ts</span>');
        expect(html).toContain('codicon-symbol-method');
        expect(html).toContain('md-ref__symbol-icon--method');
        expect(html).not.toContain('md-ref__theme-icon');
    });

    it('renders an icon from the active file icon theme instead of a Codicon fallback', () => {
        const iconData = 'data:image/svg+xml;base64,PHN2Zy8+';
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            workspaceRootForDocument: () => root,
            fileIconForPath: () => ({ dataUri: iconData }),
        });
        const env = { currentDocument: { scheme: 'file', fsPath: markdownPath } };
        const html = markdown.render('`src/example.ts`', env);
        expect(html).toContain(`src="${iconData}"`);
        expect(html).toContain('md-ref__theme-icon');
        expect(html).not.toContain('codicon-file-code');
    });

    it('leaves missing files and existing markdown links unchanged', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            workspaceRootForDocument: () => root,
        });
        const env = { currentDocument: { scheme: 'file', fsPath: markdownPath } };
        const html = markdown.render('[src/example.ts](https://example.com) and missing/file.ts', env);
        expect(html).toContain('href="https://example.com"');
        expect(html).not.toContain('class="md-ref ');
        expect(html).toContain('missing/file.ts');
    });
});
