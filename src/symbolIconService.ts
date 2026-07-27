import * as vscode from 'vscode';
import type { RenderedThemeIcon } from './iconTheme';
import { findSymbolTarget, SymbolTarget } from './symbolNavigation';

export interface SymbolIconDescriptor {
    codicon: string;
    color: string;
    themedIcon?: RenderedThemeIcon;
}

interface SymbolFileState {
    promise: Promise<ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>>;
    symbols?: ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>;
}

const symbolProviderRetryDelays = [0, 250, 750, 1_500, 3_000, 5_000, 8_000];

export class SymbolIconService implements vscode.Disposable {
    private readonly files = new Map<string, SymbolFileState>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private refreshTimer: NodeJS.Timeout | undefined;

    constructor(private readonly productIconForId?: (iconId: string) => RenderedThemeIcon | undefined) {
        this.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                this.files.delete(event.document.uri.fsPath);
                this.schedulePreviewRefresh();
            }),
            vscode.extensions.onDidChange(() => {
                this.files.clear();
                this.schedulePreviewRefresh();
            })
        );
    }

    resolve(filePath: string, requestedSymbol: string): SymbolIconDescriptor {
        const state = this.getFileState(filePath);
        const target = state.symbols
            ? findSymbolTarget(state.symbols, requestedSymbol)
            : undefined;
        const descriptor = symbolIconForKind(target?.kind ?? provisionalKind(requestedSymbol));
        return {
            ...descriptor,
            themedIcon: this.productIconForId?.(descriptor.codicon.slice('codicon-'.length)),
        };
    }

    resolveTarget(filePath: string, requestedSymbol: string): SymbolTarget | null | undefined {
        const state = this.getFileState(filePath);
        if (!state.symbols) return undefined;
        return findSymbolTarget(state.symbols, requestedSymbol) ?? null;
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
            const document = await vscode.workspace.openTextDocument(fileUri);
            await activateLanguageExtensions(document.languageId);
            return await loadDocumentSymbolsWithRetry(() =>
                vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
                    'vscode.executeDocumentSymbolProvider',
                    fileUri
                )
            );
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

export async function loadDocumentSymbolsWithRetry(
    requestSymbols: () => Thenable<ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation> | undefined>,
    retryDelays: readonly number[] = symbolProviderRetryDelays,
    wait: (milliseconds: number) => Promise<void> = delay
): Promise<ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>> {
    for (const retryDelay of retryDelays) {
        if (retryDelay > 0) await wait(retryDelay);
        try {
            const symbols = await requestSymbols();
            if (symbols?.length) return symbols;
        } catch {
            // A language server can reject requests while it is still starting.
        }
    }
    return [];
}

async function activateLanguageExtensions(languageId: string): Promise<void> {
    const candidates = vscode.extensions.all.filter(extension =>
        !extension.isActive && extensionSupportsLanguage(extension.packageJSON, languageId)
    );
    await Promise.allSettled(candidates.map(extension => extension.activate()));
}

export function extensionSupportsLanguage(packageJson: unknown, languageId: string): boolean {
    if (!packageJson || typeof packageJson !== 'object') return false;
    const manifest = packageJson as {
        activationEvents?: unknown;
        contributes?: { languages?: unknown };
    };
    const activationEvents = Array.isArray(manifest.activationEvents)
        ? manifest.activationEvents
        : [];
    if (activationEvents.includes(`onLanguage:${languageId}`) || activationEvents.includes('onLanguage')) {
        return true;
    }
    const languages = Array.isArray(manifest.contributes?.languages)
        ? manifest.contributes.languages
        : [];
    return languages.some(language =>
        language && typeof language === 'object'
        && 'id' in language
        && language.id === languageId
    );
}

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
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
