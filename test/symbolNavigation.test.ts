import * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import {
    extensionSupportsLanguage,
    loadDocumentSymbolsWithRetry,
    symbolIconForKind,
} from '../src/symbolIconService';
import { findSymbolTarget } from '../src/symbolNavigation';

describe('symbol navigation', () => {
    it('prefers the fully qualified nested symbol over an earlier field with the same name', () => {
        const otherEmailRange = { marker: 'other-email' } as unknown as vscode.Range;
        const userEmailRange = { marker: 'user-email' } as unknown as vscode.Range;
        const symbols = [
            documentSymbol('Account', [documentSymbol('email', [], otherEmailRange, vscode.SymbolKind.Field)]),
            documentSymbol('User', [documentSymbol('email', [], userEmailRange, vscode.SymbolKind.Property)]),
        ];

        expect(findSymbolTarget(symbols, 'User.email')?.range).toBe(userEmailRange);
        expect(findSymbolTarget(symbols, 'User.email')?.kind).toBe(vscode.SymbolKind.Property);
        expect(findSymbolTarget(symbols, 'email')?.range).toBe(otherEmailRange);
    });

    it('matches SymbolInformation using its container name', () => {
        const range = { marker: 'symbol-information' } as unknown as vscode.Range;
        const symbol = {
            name: 'email',
            containerName: 'User',
            location: { range },
            kind: vscode.SymbolKind.Field,
        } as vscode.SymbolInformation;

        expect(findSymbolTarget([symbol], 'User.email')?.range).toBe(range);
        expect(findSymbolTarget([symbol], 'User.email')?.fullRange).toBe(range);
    });

    it('keeps the full document symbol range for source previews', () => {
        const selectionRange = { marker: 'method-name' } as unknown as vscode.Range;
        const fullRange = { marker: 'method-body' } as unknown as vscode.Range;
        const symbol = documentSymbol('hello', [], selectionRange, vscode.SymbolKind.Method, fullRange);

        expect(findSymbolTarget([symbol], 'hello')?.range).toBe(selectionRange);
        expect(findSymbolTarget([symbol], 'hello')?.fullRange).toBe(fullRange);
    });

    it('maps VS Code symbol kinds to the same Outline Codicons', () => {
        expect(symbolIconForKind(vscode.SymbolKind.Field)).toEqual({
            codicon: 'codicon-symbol-field',
            color: 'field',
        });
        expect(symbolIconForKind(vscode.SymbolKind.Method)).toEqual({
            codicon: 'codicon-symbol-method',
            color: 'method',
        });
    });

    it('retries an empty document-symbol result while a language server starts', async () => {
        const symbol = documentSymbol('hello', [], undefined, vscode.SymbolKind.Method);
        const request = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([symbol]);
        const wait = vi.fn().mockResolvedValue(undefined);

        const symbols = await loadDocumentSymbolsWithRetry(request, [0, 250, 750], wait);

        expect(symbols).toEqual([symbol]);
        expect(request).toHaveBeenCalledTimes(3);
        expect(wait).toHaveBeenNthCalledWith(1, 250);
        expect(wait).toHaveBeenNthCalledWith(2, 750);
    });

    it('recognizes language extensions that need explicit cold activation', () => {
        expect(extensionSupportsLanguage({
            activationEvents: ['onLanguage:kotlin'],
        }, 'kotlin')).toBe(true);
        expect(extensionSupportsLanguage({
            contributes: { languages: [{ id: 'kotlin' }] },
        }, 'kotlin')).toBe(true);
        expect(extensionSupportsLanguage({
            activationEvents: ['onLanguage:java'],
        }, 'kotlin')).toBe(false);
    });
});

function documentSymbol(
    name: string,
    children: vscode.DocumentSymbol[],
    selectionRange = { marker: name } as unknown as vscode.Range,
    kind = vscode.SymbolKind.Class,
    range = selectionRange
): vscode.DocumentSymbol {
    return {
        name,
        children,
        selectionRange,
        range,
        kind,
    } as vscode.DocumentSymbol;
}
