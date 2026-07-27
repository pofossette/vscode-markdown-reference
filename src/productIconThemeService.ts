import * as path from 'path';
import * as vscode from 'vscode';
import {
    clearIconThemeAssetCache,
    IconTheme,
    loadIconTheme,
    RenderedThemeIcon,
    renderThemeDefinition,
} from './iconTheme';

interface ProductIconThemeContribution {
    id?: string;
    path?: string;
}

export class ProductIconThemeService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[] = [];
    private loadedThemeId: string | undefined;
    private loadedTheme: IconTheme | undefined;

    constructor() {
        this.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('workbench.productIconTheme')) this.invalidateAndRefresh();
            }),
            vscode.extensions.onDidChange(() => this.invalidateAndRefresh())
        );
    }

    resolve(iconId: string): RenderedThemeIcon | undefined {
        const theme = this.getActiveTheme();
        return theme ? renderThemeDefinition(theme, iconId) : undefined;
    }

    dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
    }

    private getActiveTheme(): IconTheme | undefined {
        const themeId = vscode.workspace.getConfiguration('workbench').get<string>('productIconTheme');
        if (!themeId) return undefined;
        if (themeId === this.loadedThemeId) return this.loadedTheme;
        this.loadedThemeId = themeId;
        this.loadedTheme = undefined;

        for (const extension of vscode.extensions.all) {
            const contributions = extension.packageJSON?.contributes?.productIconThemes;
            if (!Array.isArray(contributions)) continue;
            const contribution = (contributions as ProductIconThemeContribution[])
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
