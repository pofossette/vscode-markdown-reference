import { execFileSync } from 'child_process';
import * as path from 'path';
import type { ParsedGitReference } from './gitReference';

export type GitDiffResult = GitDiffSuccess | GitDiffFailure;

export interface GitDiffSuccess {
    ok: true;
    diff: string;
    label: string;
    comparison: string;
    repositoryRoot?: string;
}

export interface GitDiffFailure {
    ok: false;
    message: string;
}

export function loadGitDiff(
    reference: ParsedGitReference,
    documentPath: string,
    workspaceRoot?: string
): GitDiffResult {
    try {
        const repositoryRoot = findRepositoryRoot(documentPath, workspaceRoot);
        if (!repositoryRoot) {
            return { ok: false, message: 'This Markdown file is not inside a Git repository.' };
        }

        const args = gitDiffArguments(reference);
        let label: string;
        let comparison: string;

        if (reference.commit) {
            const [shortHash, subject] = runGit(repositoryRoot, [
                'show',
                '-s',
                '--format=%h%x00%s',
                reference.commit,
            ]).trim().split('\0');
            const commitLabel = subject ? `${shortHash} ${subject}` : `Commit ${shortHash || reference.commit}`;
            label = reference.kind === 'file' ? reference.filePath! : commitLabel;
            comparison = reference.kind === 'file' ? commitLabel : reference.commit;
        } else {
            label = reference.kind === 'file' ? reference.filePath! : 'Repository changes';
            comparison = `${displayRef(repositoryRoot, reference.base!)} -> ${displayRef(repositoryRoot, reference.head)}`;
        }

        const diff = runGit(repositoryRoot, args).replace(/\r\n?/g, '\n').replace(/\n$/, '');
        return { ok: true, diff, label, comparison, repositoryRoot };
    } catch {
        return {
            ok: false,
            message: 'Git diff could not be generated. Check that the refs and file path exist.',
        };
    }
}

function displayRef(repositoryRoot: string, reference: string): string {
    if (reference !== 'HEAD') return reference;
    try {
        return runGit(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    } catch {
        return runGit(repositoryRoot, ['rev-parse', '--short', 'HEAD']).trim();
    }
}

export function gitDiffArguments(reference: ParsedGitReference): string[] {
    const commonArgs = [
        '--no-ext-diff',
        '--no-textconv',
        '--no-color',
        `--unified=${reference.context}`,
    ];
    const args = reference.commit
        ? ['show', '--first-parent', '--format=', ...commonArgs, reference.commit]
        : ['diff', ...commonArgs, reference.base!, reference.head];
    if (reference.filePath) args.push('--', reference.filePath);
    return args;
}

function findRepositoryRoot(documentPath: string, workspaceRoot?: string): string | undefined {
    const anchors = [path.dirname(documentPath), workspaceRoot].filter((value): value is string => Boolean(value));
    for (const anchor of new Set(anchors)) {
        try {
            return runGit(anchor, ['rev-parse', '--show-toplevel']).trim();
        } catch {
            // Try the workspace root when the Markdown document is outside the repository.
        }
    }
    return undefined;
}

function runGit(workingDirectory: string, args: string[]): string {
    return execFileSync('git', ['--no-pager', '-c', 'core.quotepath=false', '-C', workingDirectory, ...args], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15_000,
        windowsHide: true,
    });
}
