import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSyntaxHighlightTheme, loadColorTheme } from '../src/colorTheme';

describe('VS Code color theme reuse', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reference-color-theme-'));
        fs.writeFileSync(path.join(root, 'base.json'), `{
            "colors": { "editor.foreground": "#cccccc" },
            "semanticHighlighting": true,
            "semanticTokenColors": { "function": "#44aaee" },
            "tokenColors": [
                { "scope": "keyword", "settings": { "foreground": "#cc55cc" } },
                { "scope": "comment", "settings": { "foreground": "#778899", "fontStyle": "italic" } },
                { "scope": "string", "settings": { "foreground": "#88bb66" } }
            ]
        }`);
        fs.writeFileSync(path.join(root, 'theme.json'), `{
            // Color themes are JSONC and can inherit another theme.
            "include": "./base.json",
            "tokenColors": [
                { "scope": "keyword.control.kotlin", "settings": { "foreground": "#ff8800", "fontStyle": "bold" } }
            ]
        }`);
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('maps inherited TextMate and semantic colors to highlight.js token categories', () => {
        const colorTheme = loadColorTheme(path.join(root, 'theme.json'))!;
        const syntaxTheme = createSyntaxHighlightTheme(colorTheme, 'kotlin');

        expect(syntaxTheme.foreground).toBe('#cccccc');
        expect(syntaxTheme.tokens.keyword).toMatchObject({
            color: '#ff8800',
            fontWeight: 'bold',
        });
        expect(syntaxTheme.tokens.comment).toMatchObject({
            color: '#778899',
            fontStyle: 'italic',
        });
        expect(syntaxTheme.tokens.string.color).toBe('#88bb66');
        expect(syntaxTheme.tokens.function.color).toBe('#44aaee');
    });
});
