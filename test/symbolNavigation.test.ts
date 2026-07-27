import * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';
import { symbolIconForKind } from '../src/symbolIconService';
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
});

function documentSymbol(
    name: string,
    children: vscode.DocumentSymbol[],
    selectionRange = { marker: name } as unknown as vscode.Range,
    kind = vscode.SymbolKind.Class
): vscode.DocumentSymbol {
    return {
        name,
        children,
        selectionRange,
        kind,
    } as vscode.DocumentSymbol;
}
