import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'jsonc-parser';

export interface IconDefinition {
    iconPath?: string;
    fontCharacter?: string;
    fontColor?: string;
    fontId?: string;
}

interface IconFontSource {
    path: string;
    format?: string;
}

interface IconFont {
    id: string;
    src: IconFontSource[];
    weight?: string;
    style?: string;
    size?: string;
}

interface IconAssociations {
    file?: string;
    folder?: string;
    fileNames?: Record<string, string>;
    folderNames?: Record<string, string>;
    fileExtensions?: Record<string, string>;
    languageIds?: Record<string, string>;
}

export interface IconTheme extends IconAssociations {
    iconDefinitions: Record<string, IconDefinition>;
    fonts?: IconFont[];
    light?: IconAssociations;
}

export interface RenderedThemeIcon {
    definitionId: string;
    dataUri: string;
}

const assetCache = new Map<string, string>();

export function clearIconThemeAssetCache(): void {
    assetCache.clear();
}

export function loadIconTheme(themePath: string, visited = new Set<string>()): IconTheme | undefined {
    const absoluteThemePath = path.resolve(themePath);
    if (visited.has(absoluteThemePath)) return undefined;
    visited.add(absoluteThemePath);
    try {
        const parsed = parse(fs.readFileSync(absoluteThemePath, 'utf8')) as RawIconTheme;
        if (!parsed || typeof parsed !== 'object') return undefined;
        const theme = normalizeThemeAssets(parsed, path.dirname(absoluteThemePath));
        if (!parsed.extends) return theme;
        const base = loadIconTheme(path.resolve(path.dirname(absoluteThemePath), parsed.extends), visited);
        return base ? mergeThemes(base, theme) : theme;
    } catch {
        return undefined;
    }
}

export function renderThemeIcon(
    theme: IconTheme,
    filePath: string,
    isDirectory: boolean,
    languageId: string | undefined,
    useLightVariant: boolean
): RenderedThemeIcon | undefined {
    const definitionId = resolveIconDefinitionId(theme, filePath, isDirectory, languageId, useLightVariant);
    if (!definitionId) return undefined;
    const definition = theme.iconDefinitions[definitionId];
    if (!definition) return undefined;
    const dataUri = definition.iconPath
        ? fileAssetDataUri(definition.iconPath)
        : fontIconDataUri(theme, definition);
    return dataUri ? { definitionId, dataUri } : undefined;
}

export function resolveIconDefinitionId(
    theme: IconTheme,
    filePath: string,
    isDirectory: boolean,
    languageId: string | undefined,
    useLightVariant: boolean
): string | undefined {
    const variant = useLightVariant ? theme.light : undefined;
    const name = path.basename(filePath).toLowerCase();
    if (isDirectory) {
        return variant?.folderNames?.[name]
            ?? theme.folderNames?.[name]
            ?? variant?.folder
            ?? theme.folder;
    }

    const fileNameIcon = variant?.fileNames?.[name] ?? theme.fileNames?.[name];
    if (fileNameIcon) return fileNameIcon;
    for (const extension of extensionCandidates(name)) {
        const extensionIcon = variant?.fileExtensions?.[extension] ?? theme.fileExtensions?.[extension];
        if (extensionIcon) return extensionIcon;
    }
    if (languageId) {
        const languageIcon = variant?.languageIds?.[languageId] ?? theme.languageIds?.[languageId];
        if (languageIcon) return languageIcon;
    }
    return variant?.file ?? theme.file;
}

export function languageIdForFile(filePath: string): string | undefined {
    const name = path.basename(filePath).toLowerCase();
    if (name === 'dockerfile') return 'dockerfile';
    if (name === 'makefile') return 'makefile';
    const extension = path.extname(name).slice(1);
    const ids: Record<string, string> = {
        bash: 'shellscript', c: 'c', cc: 'cpp', cpp: 'cpp', cs: 'csharp', css: 'css',
        dart: 'dart', go: 'go', gradle: 'groovy', h: 'c', hpp: 'cpp', html: 'html',
        java: 'java', js: 'javascript', json: 'json', jsonc: 'jsonc', jsx: 'javascriptreact',
        kt: 'kotlin', kts: 'kotlin', less: 'less', lua: 'lua', md: 'markdown', php: 'php',
        ps1: 'powershell', py: 'python', rb: 'ruby', rs: 'rust', scss: 'scss', sh: 'shellscript',
        sql: 'sql', svelte: 'svelte', swift: 'swift', toml: 'toml', ts: 'typescript',
        tsx: 'typescriptreact', vue: 'vue', xml: 'xml', yaml: 'yaml', yml: 'yaml', zsh: 'shellscript',
    };
    return ids[extension];
}

function extensionCandidates(fileName: string): string[] {
    const candidates: string[] = [];
    for (let index = fileName.indexOf('.'); index >= 0 && index < fileName.length - 1;) {
        candidates.push(fileName.slice(index + 1));
        index = fileName.indexOf('.', index + 1);
    }
    return candidates;
}

function fileAssetDataUri(assetPath: string): string | undefined {
    const cached = assetCache.get(assetPath);
    if (cached) return cached;
    try {
        const extension = path.extname(assetPath).slice(1).toLowerCase();
        const mimeTypes: Record<string, string> = {
            svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
        };
        const mime = mimeTypes[extension];
        if (!mime) return undefined;
        const dataUri = `data:${mime};base64,${fs.readFileSync(assetPath).toString('base64')}`;
        assetCache.set(assetPath, dataUri);
        return dataUri;
    } catch {
        return undefined;
    }
}

function fontIconDataUri(theme: IconTheme, definition: IconDefinition): string | undefined {
    if (!definition.fontCharacter) return undefined;
    const font = theme.fonts?.find(candidate => candidate.id === definition.fontId) ?? theme.fonts?.[0];
    const source = font?.src.find(candidate => candidate.format === 'woff2') ?? font?.src[0];
    if (!font || !source) return undefined;
    const cacheKey = `${source.path}:${definition.fontCharacter}:${definition.fontColor ?? ''}`;
    const cached = assetCache.get(cacheKey);
    if (cached) return cached;
    try {
        const fontData = fs.readFileSync(source.path).toString('base64');
        const format = source.format ?? (path.extname(source.path).slice(1) || 'woff');
        const mime = format === 'ttf' ? 'font/ttf' : format === 'woff2' ? 'font/woff2' : 'font/woff';
        const color = safeColor(definition.fontColor);
        const character = escapeXml(definition.fontCharacter);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`
            + `<style>@font-face{font-family:theme-icon;src:url(data:${mime};base64,${fontData}) format('${format}');}`
            + `text{font-family:theme-icon;font-size:16px;font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'}}</style>`
            + `<text x="8" y="13" text-anchor="middle" fill="${color}">${character}</text></svg>`;
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        assetCache.set(cacheKey, dataUri);
        return dataUri;
    } catch {
        return undefined;
    }
}

function safeColor(value: string | undefined): string {
    return value && /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(value)
        ? value
        : '#cccccc';
}

function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface RawIconTheme extends IconTheme {
    extends?: string;
}

function normalizeThemeAssets(theme: RawIconTheme, themeDirectory: string): IconTheme {
    const iconDefinitions = Object.fromEntries(
        Object.entries(theme.iconDefinitions ?? {}).map(([id, definition]) => [id, {
            ...definition,
            iconPath: definition.iconPath ? path.resolve(themeDirectory, definition.iconPath) : undefined,
        }])
    );
    const fonts = theme.fonts?.map(font => ({
        ...font,
        src: font.src.map(source => ({
            ...source,
            path: path.resolve(themeDirectory, source.path),
        })),
    }));
    return { ...theme, iconDefinitions, fonts };
}

function mergeThemes(base: IconTheme, current: IconTheme): IconTheme {
    return {
        ...base,
        ...current,
        iconDefinitions: { ...base.iconDefinitions, ...current.iconDefinitions },
        fonts: current.fonts ?? base.fonts,
        fileNames: { ...base.fileNames, ...current.fileNames },
        folderNames: { ...base.folderNames, ...current.folderNames },
        fileExtensions: { ...base.fileExtensions, ...current.fileExtensions },
        languageIds: { ...base.languageIds, ...current.languageIds },
        light: {
            ...base.light,
            ...current.light,
            fileNames: { ...base.light?.fileNames, ...current.light?.fileNames },
            folderNames: { ...base.light?.folderNames, ...current.light?.folderNames },
            fileExtensions: { ...base.light?.fileExtensions, ...current.light?.fileExtensions },
            languageIds: { ...base.light?.languageIds, ...current.light?.languageIds },
        },
    };
}
