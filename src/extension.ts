import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { FileIconThemeService } from './fileIconThemeService';
import { installMarkdownReferencePlugin } from './markdownPlugin';
import { SymbolIconService } from './symbolIconService';
import { handleSymbolUri } from './symbolNavigation';

interface MarkdownItExtension {
    extendMarkdownIt(markdown: MarkdownIt): MarkdownIt;
}

export function activate(context: vscode.ExtensionContext): MarkdownItExtension {
    const fileIcons = new FileIconThemeService();
    const symbolIcons = new SymbolIconService();
    context.subscriptions.push(fileIcons, symbolIcons);
    context.subscriptions.push(vscode.window.registerUriHandler({
        handleUri(uri) {
            return handleSymbolUri(uri, symbolIcons);
        },
    }));
    return {
        extendMarkdownIt(markdown: MarkdownIt): MarkdownIt {
            return installMarkdownReferencePlugin(markdown, {
                workspaceRootForDocument(documentPath) {
                    return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(documentPath))?.uri.fsPath;
                },
                fileIconForPath(filePath, isDirectory) {
                    return fileIcons.resolve(filePath, isDirectory);
                },
                symbolIconForReference(filePath, symbol) {
                    return symbolIcons.resolve(filePath, symbol);
                },
            });
        },
    };
}

export function deactivate(): void {}
