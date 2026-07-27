import * as path from 'path';
import * as vscode from 'vscode';

export interface SymbolTarget {
    name: string;
    qualifiedName: string;
    range: vscode.Range;
    kind: vscode.SymbolKind;
}

export interface SymbolTargetResolver {
    getTarget(filePath: string, requestedSymbol: string): Promise<SymbolTarget | undefined>;
}

export async function handleSymbolUri(uri: vscode.Uri, resolver?: SymbolTargetResolver): Promise<void> {
    if (uri.path !== '/open-symbol') return;
    const query = new URLSearchParams(uri.query);
    const filePath = query.get('file');
    const requestedSymbol = query.get('symbol');
    if (!filePath || !requestedSymbol || !path.isAbsolute(filePath)) {
        void vscode.window.showErrorMessage('Markdown Reference: invalid symbol link.');
        return;
    }

    const fileUri = vscode.Uri.file(filePath);
    let document: vscode.TextDocument;
    try {
        document = await vscode.workspace.openTextDocument(fileUri);
    } catch {
        void vscode.window.showErrorMessage(`Markdown Reference: cannot open ${filePath}.`);
        return;
    }

    let target: SymbolTarget | undefined;
    if (resolver) {
        target = await resolver.getTarget(filePath, requestedSymbol);
    } else {
        try {
            const symbols = await vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
                'vscode.executeDocumentSymbolProvider',
                fileUri
            );
            target = findSymbolTarget(symbols ?? [], requestedSymbol);
        } catch {
            target = undefined;
        }
    }
    const fallbackRange = target ? undefined : findTextFallback(document, requestedSymbol);
    const selection = target?.range ?? fallbackRange;

    await vscode.window.showTextDocument(document, {
        preview: true,
        selection,
    });
    if (!selection) {
        void vscode.window.showWarningMessage(
            `Markdown Reference: symbol "${requestedSymbol}" was not found in ${path.basename(filePath)}.`
        );
    }
}

export function findSymbolTarget(
    symbols: ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>,
    requestedSymbol: string
): SymbolTarget | undefined {
    const targets = flattenSymbols(symbols);
    return targets.find(target => target.qualifiedName === requestedSymbol)
        ?? targets.find(target => target.name === requestedSymbol)
        ?? targets.find(target => target.qualifiedName.endsWith(`.${requestedSymbol}`));
}

function flattenSymbols(
    symbols: ReadonlyArray<vscode.DocumentSymbol | vscode.SymbolInformation>,
    parents: string[] = []
): SymbolTarget[] {
    const targets: SymbolTarget[] = [];
    for (const symbol of symbols) {
        if (isDocumentSymbol(symbol)) {
            const names = [...parents, symbol.name];
            targets.push({
                name: symbol.name,
                qualifiedName: names.join('.'),
                range: symbol.selectionRange,
                kind: symbol.kind,
            });
            targets.push(...flattenSymbols(symbol.children, names));
        } else {
            const qualifiedName = symbol.containerName
                ? `${symbol.containerName}.${symbol.name}`
                : symbol.name;
            targets.push({
                name: symbol.name,
                qualifiedName,
                range: symbol.location.range,
                kind: symbol.kind,
            });
        }
    }
    return targets;
}

function isDocumentSymbol(
    symbol: vscode.DocumentSymbol | vscode.SymbolInformation
): symbol is vscode.DocumentSymbol {
    return 'selectionRange' in symbol && 'children' in symbol;
}

function findTextFallback(document: vscode.TextDocument, requestedSymbol: string): vscode.Range | undefined {
    const leafName = requestedSymbol.split('.').at(-1);
    if (!leafName) return undefined;
    const escapedName = leafName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|[^A-Za-z0-9_$])(${escapedName})(?=$|[^A-Za-z0-9_$])`, 'm')
        .exec(document.getText());
    if (!match) return undefined;
    const startOffset = match.index + match[1].length;
    return new vscode.Range(
        document.positionAt(startOffset),
        document.positionAt(startOffset + leafName.length)
    );
}
