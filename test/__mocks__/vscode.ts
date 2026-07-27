export class Uri {
    readonly path: string;
    readonly query = '';
    private constructor(public readonly fsPath: string) {
        this.path = fsPath;
    }
    static file(filePath: string): Uri {
        return new Uri(filePath);
    }
}

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
}

export const workspace = {
    getWorkspaceFolder: (_uri: Uri) => undefined,
    openTextDocument: async (_uri: Uri) => undefined,
    onDidChangeTextDocument: () => ({ dispose() {} }),
};

export const commands = {
    executeCommand: async () => undefined,
};

export const window = {
    registerUriHandler: () => ({ dispose() {} }),
    showTextDocument: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
};

export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}
