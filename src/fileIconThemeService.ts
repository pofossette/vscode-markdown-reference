import * as path from 'path';
import * as vscode from 'vscode';
import {
    clearIconThemeAssetCache,
    IconTheme,
    languageIdForFile,
    loadIconTheme,
    RenderedThemeIcon,
    renderThemeIcon,
} from './iconTheme';

interface IconThemeContribution {
    id?: string;
    path?: string;
}

export class FileIconThemeService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[] = [];
    private loadedThemeId: string | undefined;
    private loadedTheme: IconTheme | undefined;

    constructor() {
        this.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('workbench.iconTheme')) this.invalidateAndRefresh();
            }),
            vscode.window.onDidChangeActiveColorTheme(() => this.invalidateAndRefresh()),
            vscode.extensions.onDidChange(() => this.invalidateAndRefresh())
        );
    }

    resolve(filePath: string, isDirectory: boolean): RenderedThemeIcon | undefined {
        const theme = this.getActiveTheme();
        if (!theme) return undefined;
        const kind = vscode.window.activeColorTheme.kind;
        const useLightVariant = kind === vscode.ColorThemeKind.Light
            || kind === vscode.ColorThemeKind.HighContrastLight;
        return renderThemeIcon(theme, filePath, isDirectory, languageIdForFile(filePath), useLightVariant);
    }

    dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
    }

    private getActiveTheme(): IconTheme | undefined {
        const themeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
        if (!themeId) return undefined;
        if (themeId === this.loadedThemeId) return this.loadedTheme;
        this.loadedThemeId = themeId;
        this.loadedTheme = undefined;

        for (const extension of vscode.extensions.all) {
            const contributions = extension.packageJSON?.contributes?.iconThemes;
            if (!Array.isArray(contributions)) continue;
            const contribution = (contributions as IconThemeContribution[])
                .find(candidate => candidate.id === themeId && typeof candidate.path === 'string');
            if (!contribution?.path) continue;
            this.loadedTheme = loadIconTheme(path.resolve(extension.extensionPath, contribution.path));
            break;
        }
        return this.loadedTheme;
    }

    private invalidateAndRefresh(): void {
        this.loadedThemeId = undefined;
        this.loadedTheme = undefined;
        clearIconThemeAssetCache();
        void vscode.commands.executeCommand('markdown.preview.refresh');
    }
}
