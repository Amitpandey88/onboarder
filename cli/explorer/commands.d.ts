export declare const EXIT: unique symbol;
export declare const CLEAR: unique symbol;
export declare const COMMANDS: {
    name: string;
    aliases: string[];
    group: string;
    usage: string;
    summary: string;
    run: (ctx: any, args: any) => any;
}[];
export declare function lookup(word: any): any;
export declare function commandNames(): string[];
export declare function helpText(ctx: any, topic?: string): string;
export declare function tokenize(line: any): any[];
declare function completer(repo: any): (line: any) => any[];
declare function shellEscape(line: any, cwd: any): Promise<string>;
export { completer, shellEscape };
