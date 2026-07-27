import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'jsonc-parser';

export type SyntaxTokenKind =
    | 'addition'
    | 'attribute'
    | 'built-in'
    | 'comment'
    | 'deletion'
    | 'function'
    | 'keyword'
    | 'literal'
    | 'meta'
    | 'number'
    | 'parameter'
    | 'property'
    | 'regexp'
    | 'selector'
    | 'string'
    | 'symbol'
    | 'tag'
    | 'type'
    | 'variable';

export interface SyntaxTokenStyle {
    color: string;
    fontStyle: 'italic' | 'normal';
    fontWeight: 'bold' | 'normal';
    textDecoration: 'none' | 'underline';
}

export interface SyntaxHighlightTheme {
    foreground: string;
    tokens: Record<SyntaxTokenKind, SyntaxTokenStyle>;
}

interface TokenSettings {
    foreground?: string;
    fontStyle?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

interface TokenColorRule {
    scope?: string | string[];
    settings?: TokenSettings;
}

interface RawColorTheme {
    include?: string;
    colors?: Record<string, string>;
    tokenColors?: TokenColorRule[];
    semanticHighlighting?: boolean;
    semanticTokenColors?: Record<string, string | TokenSettings>;
}

export interface ColorTheme {
    colors: Record<string, string>;
    tokenColors: TokenColorRule[];
    semanticHighlighting: boolean;
    semanticTokenColors: Record<string, string | TokenSettings>;
}

const tokenScopes: Record<SyntaxTokenKind, string[]> = {
    addition: ['markup.inserted'],
    attribute: ['entity.other.attribute-name'],
    'built-in': ['support.function', 'support.type'],
    comment: ['comment'],
    deletion: ['markup.deleted'],
    function: ['entity.name.function', 'support.function'],
    keyword: ['keyword.control', 'keyword', 'storage.type'],
    literal: ['constant.language', 'constant.other.symbol'],
    meta: ['meta.preprocessor', 'meta'],
    number: ['constant.numeric'],
    parameter: ['variable.parameter.function', 'variable.parameter'],
    property: ['variable.other.property', 'support.variable.property'],
    regexp: ['string.regexp'],
    selector: ['meta.selector', 'entity.other.attribute-name.class'],
    string: ['string.quoted', 'string'],
    symbol: ['constant.other.symbol'],
    tag: ['entity.name.tag'],
    type: ['entity.name.type.class', 'entity.name.type', 'support.type', 'storage.type'],
    variable: ['variable.other.readwrite', 'variable.other'],
};

const semanticTokens: Partial<Record<SyntaxTokenKind, string[]>> = {
    function: ['function', 'method'],
    parameter: ['parameter'],
    property: ['property'],
    type: ['type', 'class', 'interface', 'enum'],
    variable: ['variable'],
};

export function loadColorTheme(themePath: string, visited = new Set<string>()): ColorTheme | undefined {
    const absolutePath = path.resolve(themePath);
    if (visited.has(absolutePath)) return undefined;
    visited.add(absolutePath);
    try {
        const raw = parse(fs.readFileSync(absolutePath, 'utf8')) as RawColorTheme;
        if (!raw || typeof raw !== 'object') return undefined;
        const current = normalizeTheme(raw);
        if (!raw.include) return current;
        const base = loadColorTheme(path.resolve(path.dirname(absolutePath), raw.include), visited);
        return base ? mergeThemes(base, current) : current;
    } catch {
        return undefined;
    }
}

export function createSyntaxHighlightTheme(
    theme: ColorTheme,
    language: string | undefined
): SyntaxHighlightTheme {
    const languageScope = textMateLanguageScope(language);
    const sourceStyle = languageScope
        ? resolveTextMateStyle(theme.tokenColors, `source.${languageScope}`)
        : {};
    const foreground = safeColor(sourceStyle.foreground)
        ?? safeColor(theme.colors['editor.foreground'])
        ?? safeColor(theme.colors.foreground)
        ?? '#cccccc';
    const tokens = {} as Record<SyntaxTokenKind, SyntaxTokenStyle>;
    for (const kind of Object.keys(tokenScopes) as SyntaxTokenKind[]) {
        const textMateStyle = resolveFirstTextMateStyle(theme.tokenColors, tokenScopes[kind], languageScope);
        const semanticStyle = theme.semanticHighlighting
            ? resolveSemanticStyle(theme.semanticTokenColors, semanticTokens[kind], languageScope)
            : {};
        tokens[kind] = normalizeStyle({ ...textMateStyle, ...semanticStyle }, foreground);
    }
    return { foreground, tokens };
}

function normalizeTheme(raw: RawColorTheme): ColorTheme {
    return {
        colors: raw.colors ?? {},
        tokenColors: Array.isArray(raw.tokenColors) ? raw.tokenColors : [],
        semanticHighlighting: raw.semanticHighlighting ?? false,
        semanticTokenColors: raw.semanticTokenColors ?? {},
    };
}

function mergeThemes(base: ColorTheme, current: ColorTheme): ColorTheme {
    return {
        colors: { ...base.colors, ...current.colors },
        tokenColors: [...base.tokenColors, ...current.tokenColors],
        semanticHighlighting: current.semanticHighlighting || base.semanticHighlighting,
        semanticTokenColors: { ...base.semanticTokenColors, ...current.semanticTokenColors },
    };
}

function resolveFirstTextMateStyle(
    rules: TokenColorRule[],
    scopes: string[],
    languageScope: string | undefined
): TokenSettings {
    const combined: TokenSettings = {};
    for (const baseScope of scopes) {
        const target = languageScope ? `${baseScope}.${languageScope}` : baseScope;
        const resolved = resolveTextMateStyle(rules, target);
        for (const key of ['foreground', 'fontStyle'] as const) {
            if (combined[key] === undefined && resolved[key] !== undefined) combined[key] = resolved[key];
        }
        if (combined.foreground !== undefined && combined.fontStyle !== undefined) break;
    }
    return combined;
}

function resolveTextMateStyle(rules: TokenColorRule[], targetScope: string): TokenSettings {
    const resolved: TokenSettings = {};
    const scores: Partial<Record<'foreground' | 'fontStyle', number>> = {};
    rules.forEach((rule, ruleIndex) => {
        if (!rule.settings) return;
        for (const selector of scopeSelectors(rule.scope)) {
            if (!scopeMatches(selector, targetScope)) continue;
            const score = selector.split('.').length * 10000 + selector.length * 10 + ruleIndex;
            for (const key of ['foreground', 'fontStyle'] as const) {
                if (rule.settings[key] !== undefined && score >= (scores[key] ?? -1)) {
                    resolved[key] = rule.settings[key];
                    scores[key] = score;
                }
            }
        }
    });
    return resolved;
}

function resolveSemanticStyle(
    semanticColors: Record<string, string | TokenSettings>,
    tokenNames: string[] | undefined,
    languageScope: string | undefined
): TokenSettings {
    if (!tokenNames) return {};
    for (const tokenName of tokenNames) {
        const candidates = languageScope ? [`${tokenName}:${languageScope}`, tokenName] : [tokenName];
        for (const candidate of candidates) {
            const value = semanticColors[candidate];
            if (typeof value === 'string') return { foreground: value };
            if (value && typeof value === 'object') return value;
        }
    }
    return {};
}

function scopeSelectors(scope: TokenColorRule['scope']): string[] {
    const values = Array.isArray(scope) ? scope : typeof scope === 'string' ? scope.split(',') : [];
    return values
        .map(value => value.trim().split(/\s+/).at(-1) ?? '')
        .filter(value => value && !value.startsWith('-'));
}

function scopeMatches(selector: string, target: string): boolean {
    return target === selector || target.startsWith(`${selector}.`);
}

function normalizeStyle(settings: TokenSettings, fallbackColor: string): SyntaxTokenStyle {
    const fontStyle = settings.fontStyle ?? '';
    return {
        color: safeColor(settings.foreground) ?? fallbackColor,
        fontStyle: settings.italic || /\bitalic\b/.test(fontStyle) ? 'italic' : 'normal',
        fontWeight: settings.bold || /\bbold\b/.test(fontStyle) ? 'bold' : 'normal',
        textDecoration: settings.underline || /\bunderline\b/.test(fontStyle) ? 'underline' : 'none',
    };
}

function safeColor(value: string | undefined): string | undefined {
    return value && /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|hsla?\([\d\s,.%]+\)|[a-z]+)$/i.test(value)
        ? value
        : undefined;
}

function textMateLanguageScope(language: string | undefined): string | undefined {
    if (!language) return undefined;
    const aliases: Record<string, string> = {
        csharp: 'cs',
        javascript: 'js',
        javascriptreact: 'jsx',
        shell: 'shell',
        typescript: 'ts',
        typescriptreact: 'tsx',
    };
    return aliases[language] ?? language;
}
