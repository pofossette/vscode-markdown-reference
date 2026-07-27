import * as path from 'path';
import MarkdownIt from 'markdown-it';
import { describe, expect, it, vi } from 'vitest';
import { gitDiffArguments } from '../src/gitDiff';
import { parseGitPatch } from '../src/gitPatch';
import { findGitReferenceMatches, parseGitReference } from '../src/gitReference';
import { installMarkdownReferencePlugin } from '../src/markdownPlugin';

describe('Git reference parsing', () => {
    it('compares a repository file from a named base to the dynamic current branch', () => {
        expect(parseGitReference('src/app.ts?git_diff=true&base=main')).toEqual({
            raw: 'src/app.ts?git_diff=true&base=main',
            kind: 'file',
            filePath: 'src/app.ts',
            base: 'main',
            head: 'HEAD',
            context: 3,
            diffOnly: false,
        });
    });

    it('supports two named refs, repository diffs, commits, and rendering controls', () => {
        expect(parseGitReference(
            '.?git_diff=true&base=release/1.0&head=feature/refactor&context=0&diff_only=true'
        )).toMatchObject({
            kind: 'repository',
            base: 'release/1.0',
            head: 'feature/refactor',
            context: 0,
            diffOnly: true,
        });
        expect(parseGitReference('.?git_diff=true&commit=a1b2c3d&context=8')).toMatchObject({
            kind: 'repository',
            commit: 'a1b2c3d',
            context: 8,
        });
        expect(parseGitReference('src/app.ts?git_diff=true&commit=a1b2c3d')).toMatchObject({
            kind: 'file',
            filePath: 'src/app.ts',
            commit: 'a1b2c3d',
        });
    });

    it('rejects unsafe paths, missing comparisons, and command-like refs', () => {
        expect(parseGitReference('../outside.ts?git_diff=true&base=main')).toBeUndefined();
        expect(parseGitReference('C:/outside.ts?git_diff=true&base=main')).toBeUndefined();
        expect(parseGitReference('src/app.ts?base=main')).toBeUndefined();
        expect(parseGitReference('src/app.ts?git_diff=true&base=--output=/tmp/file')).toBeUndefined();
        expect(parseGitReference('.?git_diff=true&head=feature')).toBeUndefined();
        expect(parseGitReference('.?git_diff=true&commit=main&base=other')).toBeUndefined();
        expect(parseGitReference('src/app.ts?git_diff=true&base=main&context=101')).toBeUndefined();
    });

    it('finds bare Git references in prose', () => {
        const text = 'Compare src/app.ts?git_diff=true&base=main and .?git_diff=true&commit=abc123&diff_only=true.';
        expect(findGitReferenceMatches(text).map(match => match.value)).toEqual([
            'src/app.ts?git_diff=true&base=main',
            '.?git_diff=true&commit=abc123&diff_only=true',
        ]);
    });

    it('builds bounded Git commands with refs and file paths as separate arguments', () => {
        const reference = parseGitReference(
            'src/app.ts?git_diff=true&base=main&head=feature/refactor&context=5'
        )!;
        expect(gitDiffArguments(reference)).toEqual([
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            '--no-color',
            '--unified=5',
            'main',
            'feature/refactor',
            '--',
            'src/app.ts',
        ]);
        expect(gitDiffArguments(parseGitReference('.?git_diff=true&commit=abc123&context=0')!)).toEqual([
            'show',
            '--first-parent',
            '--format=',
            '--no-ext-diff',
            '--no-textconv',
            '--no-color',
            '--unified=0',
            'abc123',
        ]);
    });

    it('converts unified patch metadata into source-oriented diff lines', () => {
        const files = parseGitPatch([
            'diff --git a/src/app.ts b/src/app.ts',
            'index 1111111..2222222 100644',
            '--- a/src/app.ts',
            '+++ b/src/app.ts',
            '@@ -1,2 +1,2 @@',
            '-const oldValue = 1;',
            '+const newValue = 2;',
            ' unchanged();',
            '@@ -20 +20 @@',
            '-finish(false);',
            '+finish(true);',
        ].join('\n'));

        expect(files).toEqual([{
            oldPath: 'src/app.ts',
            newPath: 'src/app.ts',
            path: 'src/app.ts',
            lines: [
                { kind: 'deletion', content: 'const oldValue = 1;' },
                { kind: 'addition', content: 'const newValue = 2;' },
                { kind: 'context', content: 'unchanged();' },
                { kind: 'separator', content: '...' },
                { kind: 'deletion', content: 'finish(false);' },
                { kind: 'addition', content: 'finish(true);' },
            ],
        }]);
    });
});

describe('Git diff rendering', () => {
    const documentPath = path.join('workspace', 'docs', 'README.md');
    const env = { currentDocument: { scheme: 'file', fsPath: documentPath } };
    const diff = [
        'diff --git a/src/app.ts b/src/app.ts',
        'index 1111111..2222222 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,2 +1,2 @@',
        '-const value = 1;',
        '+const value = 2;',
        ' unchanged();',
    ].join('\n');

    it('renders a GitHub-style diff with comparison metadata and line states', () => {
        const highlight = vi.fn((source: string) => source);
        const gitDiffForReference = vi.fn(() => ({
            ok: true as const,
            diff,
            label: 'src/app.ts',
            comparison: 'main -> HEAD',
        }));
        const markdown = installMarkdownReferencePlugin(new MarkdownIt({ highlight }), { gitDiffForReference });

        const html = markdown.render('`src/app.ts?git_diff=true&base=main&context=1`', env);

        expect(gitDiffForReference).toHaveBeenCalledWith(
            expect.objectContaining({ base: 'main', head: 'HEAD', context: 1 }),
            documentPath,
            undefined
        );
        expect(html).toContain('md-ref-git-diff__header');
        expect(html).toContain('src/app.ts');
        expect(html).toContain('main -&gt; HEAD');
        expect(html).toContain('md-ref-git-diff__line--deletion');
        expect(html).toContain('md-ref-git-diff__line--addition');
        expect(html).toContain('md-ref-git-diff__marker">-</span>');
        expect(html).toContain('md-ref-git-diff__marker">+</span>');
        expect(html).toContain('md-ref-git-diff__language">ts</span>');
        expect(html).toContain('language-typescript');
        expect(html).not.toContain('diff --git');
        expect(html).not.toContain('@@ -1,2 +1,2 @@');
        expect(highlight).toHaveBeenCalledWith(
            ['const value = 1;', 'const value = 2;', 'unchanged();'].join('\n'),
            'typescript',
            ''
        );
    });

    it('renders a bare path-based Git reference exactly once', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            gitDiffForReference: () => ({
                ok: true,
                diff,
                label: 'src/app.ts',
                comparison: 'main -> HEAD',
            }),
        });

        const html = markdown.render('Compare src/app.ts?git_diff=true&base=main now.', env);

        expect(html.match(/md-ref-git-diff__header/g)).toHaveLength(1);
        expect(html).not.toContain('git_diff=true');
        expect(html).not.toContain('Compare src/app.ts<span');
    });

    it('omits all diff metadata when diffOnly is enabled', () => {
        const markdown = installMarkdownReferencePlugin(new MarkdownIt(), {
            gitDiffForReference: () => ({
                ok: true,
                diff,
                label: 'Repository changes',
                comparison: 'main -> feature/refactor',
            }),
        });

        const html = markdown.render(
            '`.?git_diff=true&base=main&head=feature/refactor&diff_only=true`',
            env
        );

        expect(html).toContain('md-ref-git-diff--only');
        expect(html).toContain('md-ref-git-diff__line--addition');
        expect(html).not.toContain('md-ref-git-diff__header');
        expect(html).not.toContain('Repository changes');
    });
});
