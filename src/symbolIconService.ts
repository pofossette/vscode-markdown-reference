import * as vscode from 'vscode';
import { findSymbolTarget, SymbolTarget } from './symbolNavigation';

export interface SymbolIconDescriptor {
    codicon: string;
    color: string;
}

interface SymbolFileState {
    promise: Promise<ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>>;
    symbols?: ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>;
}

export class SymbolIconService implements vscode.Disposable {
    private readonly files = new Map<string, SymbolFileState>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private refreshTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
            this.files.delete(event.document.uri.fsPath);
            this.schedulePreviewRefresh();
        }));
    }

    resolve(filePath: string, requestedSymbol: string): SymbolIconDescriptor {
        const state = this.getFileState(filePath);
        const target = state.symbols
            ? findSymbolTarget(state.symbols, requestedSymbol)
            : undefined;
        return symbolIconForKind(target?.kind ?? provisionalKind(requestedSymbol));
    }

    async getTarget(filePath: string, requestedSymbol: string): Promise<SymbolTarget | undefined> {
        const symbols = await this.getFileState(filePath).promise;
        return findSymbolTarget(symbols, requestedSymbol);
    }

    dispose(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        for (const subscription of this.subscriptions) subscription.dispose();
    }

    private getFileState(filePath: string): SymbolFileState {
        const cached = this.files.get(filePath);
        if (cached) return cached;
        const state: SymbolFileState = {
            promise: this.loadSymbols(filePath),
        };
        this.files.set(filePath, state);
        void state.promise.then(symbols => {
            state.symbols = symbols;
            this.schedulePreviewRefresh();
        });
        return state;
    }

    private async loadSymbols(
        filePath: string
    ): Promise<ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>> {
        try {
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.openTextDocument(fileUri);
            return await vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
                'vscode.executeDocumentSymbolProvider',
                fileUri
            ) ?? [];
        } catch {
            return [];
        }
    }

    private schedulePreviewRefresh(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void vscode.commands.executeCommand('markdown.preview.refresh');
        }, 50);
    }
}

export function symbolIconForKind(kind: vscode.SymbolKind): SymbolIconDescriptor {
    const names: Partial<Record<vscode.SymbolKind, string>> = {
        [vscode.SymbolKind.File]: 'file',
        [vscode.SymbolKind.Module]: 'module',
        [vscode.SymbolKind.Namespace]: 'namespace',
        [vscode.SymbolKind.Package]: 'package',
        [vscode.SymbolKind.Class]: 'class',
        [vscode.SymbolKind.Method]: 'method',
        [vscode.SymbolKind.Property]: 'property',
        [vscode.SymbolKind.Field]: 'field',
        [vscode.SymbolKind.Constructor]: 'constructor',
        [vscode.SymbolKind.Enum]: 'enum',
        [vscode.SymbolKind.Interface]: 'interface',
        [vscode.SymbolKind.Function]: 'function',
        [vscode.SymbolKind.Variable]: 'variable',
        [vscode.SymbolKind.Constant]: 'constant',
        [vscode.SymbolKind.String]: 'string',
        [vscode.SymbolKind.Number]: 'number',
        [vscode.SymbolKind.Boolean]: 'boolean',
        [vscode.SymbolKind.Array]: 'array',
        [vscode.SymbolKind.Object]: 'object',
        [vscode.SymbolKind.Key]: 'key',
        [vscode.SymbolKind.Null]: 'null',
        [vscode.SymbolKind.EnumMember]: 'enum-member',
        [vscode.SymbolKind.Struct]: 'struct',
        [vscode.SymbolKind.Event]: 'event',
        [vscode.SymbolKind.Operator]: 'operator',
        [vscode.SymbolKind.TypeParameter]: 'type-parameter',
    };
    const name = names[kind] ?? 'misc';
    return { codicon: `codicon-symbol-${name}`, color: name };
}

function provisionalKind(requestedSymbol: string): vscode.SymbolKind {
    const leaf = requestedSymbol.split('.').at(-1) ?? requestedSymbol;
    if (requestedSymbol.includes('.')) return vscode.SymbolKind.Field;
    if (/^[A-Z]/.test(leaf)) return vscode.SymbolKind.Class;
    return vscode.SymbolKind.Method;
}
