import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    loadIconTheme,
    renderThemeDefinition,
    renderThemeIcon,
    resolveIconDefinitionId,
} from '../src/iconTheme';

describe('VS Code file icon theme reuse', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reference-icons-'));
        fs.writeFileSync(path.join(root, 'typescript.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#3178c6" d="M0 0h16v16H0z"/></svg>');
        fs.writeFileSync(path.join(root, 'theme.woff'), 'test-font-data');
        fs.writeFileSync(path.join(root, 'theme.json'), `{
            // File icon themes are JSONC, not strict JSON.
            "fonts": [{ "id": "test", "src": [{ "path": "./theme.woff", "format": "woff" }] }],
            "iconDefinitions": {
                "default": { "fontCharacter": "D", "fontColor": "#cccccc" },
                "symbol-method": { "fontCharacter": "\\\\c1", "fontId": "test" },
                "typescript": { "iconPath": "./typescript.svg" },
                "declaration": { "iconPath": "./typescript.svg" },
                "package": { "iconPath": "./typescript.svg" },
                "typescriptLight": { "iconPath": "./typescript.svg" }
            },
            "file": "default",
            "fileNames": { "package.json": "package" },
            "fileExtensions": { "d.ts": "declaration", "ts": "typescript" },
            "languageIds": { "typescript": "typescript" },
            "light": { "fileExtensions": { "ts": "typescriptLight" } }
        }`);
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('uses file name, longest extension, language, and light overrides in VS Code order', () => {
        const theme = loadIconTheme(path.join(root, 'theme.json'))!;
        expect(resolveIconDefinitionId(theme, 'package.json', false, 'json', false)).toBe('package');
        expect(resolveIconDefinitionId(theme, 'types.d.ts', false, 'typescript', false)).toBe('declaration');
        expect(resolveIconDefinitionId(theme, 'index.ts', false, 'typescript', false)).toBe('typescript');
        expect(resolveIconDefinitionId(theme, 'index.ts', false, 'typescript', true)).toBe('typescriptLight');
        expect(resolveIconDefinitionId(theme, 'unknown.bin', false, undefined, false)).toBe('default');
    });

    it('embeds SVG assets and font-based theme icons as data images', () => {
        const theme = loadIconTheme(path.join(root, 'theme.json'))!;
        const svgIcon = renderThemeIcon(theme, 'index.ts', false, 'typescript', false)!;
        expect(svgIcon.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(Buffer.from(svgIcon.dataUri.split(',')[1], 'base64').toString()).toContain('#3178c6');

        const fontIcon = renderThemeIcon(theme, 'unknown.bin', false, undefined, false)!;
        const generatedSvg = Buffer.from(fontIcon.dataUri.split(',')[1], 'base64').toString();
        expect(generatedSvg).toContain('@font-face');
        expect(generatedSvg).toContain('font/woff;base64,');
    });

    it('renders product icon definitions and decodes VS Code hex glyph notation', () => {
        const theme = loadIconTheme(path.join(root, 'theme.json'))!;
        const icon = renderThemeDefinition(theme, 'symbol-method')!;
        const generatedSvg = Buffer.from(icon.dataUri.split(',')[1], 'base64').toString();

        expect(icon.definitionId).toBe('symbol-method');
        expect(generatedSvg).toContain('>Á</text>');
        expect(generatedSvg).not.toContain('>\\c1</text>');
    });
});
