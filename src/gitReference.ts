import * as path from 'path';

export interface ParsedGitReference {
    raw: string;
    kind: 'file' | 'repository';
    filePath?: string;
    commit?: string;
    base?: string;
    head: string;
    context: number;
    diffOnly: boolean;
}

export interface GitReferenceMatch {
    index: number;
    length: number;
    value: string;
}

const bareGitReferencePattern = /(^|[\s([{\"'])((?:\.|[A-Za-z0-9_@+~.\/\\-]+)\?[^\s)\]}\"',;!\u3002\uff0c\uff1b\uff01\uff1f]+)/gi;
const gitRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/@+~^{}-]*$/;

export function parseGitReference(value: string): ParsedGitReference | undefined {
    const raw = value.trim();
    if (!raw || /[\r\n]/.test(raw)) return undefined;

    const queryIndex = raw.indexOf('?');
    if (queryIndex <= 0 || raw.indexOf('?', queryIndex + 1) >= 0) return undefined;
    const rawTarget = raw.slice(0, queryIndex);
    const query = raw.slice(queryIndex + 1);
    if (!query) return undefined;

    const options = parseGitQuery(query);
    if (!options) return undefined;

    const repositoryReference = rawTarget === '.';
    const filePath = repositoryReference ? undefined : normalizeRepositoryPath(rawTarget);
    if (!repositoryReference && !filePath) return undefined;
    if (options.commit) {
        if (options.base || options.head) return undefined;
    } else if (!options.base) {
        return undefined;
    }
    return {
        raw,
        kind: repositoryReference ? 'repository' : 'file',
        ...(filePath ? { filePath } : {}),
        ...(options.commit ? { commit: options.commit } : {}),
        base: options.base,
        head: options.commit ?? options.head ?? 'HEAD',
        context: options.context,
        diffOnly: options.diffOnly,
    };
}

export function findGitReferenceMatches(text: string): GitReferenceMatch[] {
    const matches: GitReferenceMatch[] = [];
    bareGitReferencePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = bareGitReferencePattern.exec(text))) {
        const prefixLength = match[1].length;
        let value = match[2];
        while (!parseGitReference(value) && /[.?!]$/.test(value)) value = value.slice(0, -1);
        if (!parseGitReference(value)) continue;
        matches.push({
            index: match.index + prefixLength,
            length: value.length,
            value,
        });
    }
    return matches;
}

interface GitQueryOptions {
    base?: string;
    head?: string;
    commit?: string;
    context: number;
    diffOnly: boolean;
}

function parseGitQuery(query: string | undefined): GitQueryOptions | undefined {
    const result: GitQueryOptions = { context: 3, diffOnly: false };
    if (query === undefined) return result;

    const seen = new Set<string>();
    let gitDiff = false;
    for (const [rawKey, value] of new URLSearchParams(query)) {
        const key = rawKey.toLowerCase();
        if (seen.has(key)) return undefined;
        seen.add(key);
        if (key === 'git_diff') {
            if (value.toLowerCase() !== 'true') return undefined;
            gitDiff = true;
        } else if (key === 'base' || key === 'head' || key === 'commit') {
            if (!isGitRef(value)) return undefined;
            if (key === 'base') result.base = value;
            else if (key === 'head') result.head = value;
            else result.commit = value;
        } else if (key === 'context') {
            if (!/^\d{1,3}$/.test(value)) return undefined;
            const context = Number(value);
            if (context > 100) return undefined;
            result.context = context;
        } else if (key === 'diff_only' || key === 'diffonly') {
            const normalizedValue = value.toLowerCase();
            if (normalizedValue !== 'true' && normalizedValue !== 'false') return undefined;
            result.diffOnly = normalizedValue === 'true';
        } else {
            return undefined;
        }
    }
    return gitDiff ? result : undefined;
}

function isGitRef(value: string): boolean {
    return value.length <= 250
        && gitRefPattern.test(value)
        && !value.startsWith('-')
        && !value.endsWith('.')
        && !value.endsWith('.lock')
        && !value.includes('..')
        && !value.includes('@{')
        && !value.split('/').some(segment => !segment || segment.startsWith('.'));
}

function normalizeRepositoryPath(value: string): string | undefined {
    const decoded = decodeValue(value);
    if (!decoded || path.isAbsolute(decoded) || /^[A-Za-z]:/.test(decoded)) return undefined;
    const normalized = path.posix.normalize(decoded.replace(/\\/g, '/')).replace(/^\.\//, '');
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return undefined;
    if (/[\0<>|:]/.test(normalized)) return undefined;
    return normalized;
}

function decodeValue(value: string): string | undefined {
    try {
        return decodeURIComponent(value);
    } catch {
        return undefined;
    }
}
