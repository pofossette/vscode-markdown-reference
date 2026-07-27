export type GitPatchLineKind = 'context' | 'addition' | 'deletion' | 'separator' | 'message';

export interface GitPatchLine {
    kind: GitPatchLineKind;
    content: string;
}

export interface GitPatchFile {
    oldPath?: string;
    newPath?: string;
    path: string;
    lines: GitPatchLine[];
}

export function parseGitPatch(patch: string): GitPatchFile[] {
    const files: Array<Omit<GitPatchFile, 'path'>> = [];
    let current: Omit<GitPatchFile, 'path'> | undefined;
    let inHunk = false;
    let hasHunk = false;

    for (const rawLine of patch.split('\n')) {
        if (rawLine.startsWith('diff --git ')) {
            current = { lines: [] };
            files.push(current);
            inHunk = false;
            hasHunk = false;
            continue;
        }
        if (!current) continue;
        if (!inHunk && rawLine.startsWith('--- ')) {
            current.oldPath = parsePatchPath(rawLine.slice(4));
            continue;
        }
        if (!inHunk && rawLine.startsWith('+++ ')) {
            current.newPath = parsePatchPath(rawLine.slice(4));
            continue;
        }
        if (rawLine.startsWith('@@')) {
            if (hasHunk) current.lines.push({ kind: 'separator', content: '...' });
            inHunk = true;
            hasHunk = true;
            continue;
        }
        if (!inHunk) {
            if (/^(?:Binary files .* differ|GIT binary patch)$/.test(rawLine)) {
                current.lines.push({ kind: 'message', content: 'Binary file changed' });
            }
            continue;
        }
        if (rawLine.startsWith('\\ No newline at end of file')) continue;
        if (rawLine.startsWith('+')) {
            current.lines.push({ kind: 'addition', content: rawLine.slice(1) });
        } else if (rawLine.startsWith('-')) {
            current.lines.push({ kind: 'deletion', content: rawLine.slice(1) });
        } else if (rawLine.startsWith(' ')) {
            current.lines.push({ kind: 'context', content: rawLine.slice(1) });
        }
    }

    return files.map(file => {
        if (!file.lines.length && file.oldPath && file.newPath && file.oldPath !== file.newPath) {
            file.lines.push({ kind: 'message', content: `Renamed from ${file.oldPath} to ${file.newPath}` });
        }
        if (!file.lines.length) {
            file.lines.push({ kind: 'message', content: 'File metadata changed' });
        }
        return {
            ...file,
            path: file.newPath ?? file.oldPath ?? 'Changed file',
        };
    });
}

function parsePatchPath(value: string): string | undefined {
    if (value === '/dev/null') return undefined;
    let decoded = value;
    if (value.startsWith('"')) {
        try {
            decoded = JSON.parse(value) as string;
        } catch {
            decoded = value.slice(1, -1);
        }
    }
    return decoded.replace(/^[ab]\//, '');
}
