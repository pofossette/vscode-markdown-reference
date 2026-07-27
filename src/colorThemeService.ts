import * as path from 'path';
import * as vscode from 'vscode';
import { ColorTheme, createSyntaxHighlightTheme, loadColorTheme, SyntaxHighlightTheme } from './colorTheme';
import { languageForFile } from './reference';

interface ColorThemeContribution {
    id?: string;
    label?: string;
    path?: string;
}

export class ColorThemeService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly syntaxThemes = new Map<string, SyntaxHighlightTheme>();
    private loadedThemeId: string | undefined;
    private loadedTheme: ColorTheme | undefined;

    constructor() {
        this.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('workbench.colorTheme')) this.invalidateAndRefresh();
            }),
            vscode.window.onDidChangeActiveColorTheme(() => this.invalidateAndRefresh()),
            vscode.extensions.onDidChange(() => this.invalidateAndRefresh())
        );
    }

    resolve(filePath: string): SyntaxHighlightTheme | undefined {
        const theme = this.getActiveTheme();
        if (!theme) return undefined;
        const language = languageForFile(filePath);
        const cacheKey = language || '<plain>';
        const cached = this.syntaxThemes.get(cacheKey);
        if (cached) return cached;
        const syntaxTheme = createSyntaxHighlightTheme(theme, language);
        this.syntaxThemes.set(cacheKey, syntaxTheme);
        return syntaxTheme;
    }

    dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
    }

    private getActiveTheme(): ColorTheme | undefined {
        const themeId = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
        if (!themeId) return undefined;
        if (themeId === this.loadedThemeId) return this.loadedTheme;
        this.loadedThemeId = themeId;
        this.loadedTheme = undefined;

        for (const extension of vscode.extensions.all) {
            const contributions = extension.packageJSON?.contributes?.themes;
            if (!Array.isArray(contributions)) continue;
            const contribution = (contributions as ColorThemeContribution[])
                .find(candidate => matchesTheme(candidate, themeId));
            if (!contribution?.path) continue;
            this.loadedTheme = loadColorTheme(path.resolve(extension.extensionPath, contribution.path));
            break;
        }
        return this.loadedTheme;
    }

    private invalidateAndRefresh(): void {
        this.loadedThemeId = undefined;
        this.loadedTheme = undefined;
        this.syntaxThemes.clear();
        void vscode.commands.executeCommand('markdown.preview.refresh');
    }
}

function matchesTheme(contribution: ColorThemeContribution, activeTheme: string): boolean {
    const normalizedActive = normalizeThemeId(activeTheme);
    const pathId = contribution.path
        ? path.basename(contribution.path, path.extname(contribution.path)).replace(/-color-theme$/i, '')
        : undefined;
    return [contribution.id, contribution.label, pathId]
        .some(value => value && normalizeThemeId(value) === normalizedActive);
}

function normalizeThemeId(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
