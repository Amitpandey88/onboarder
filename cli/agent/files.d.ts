export declare const FILE_LIMIT: number;
export declare const hashText: (text: string) => string;
export declare function safeRelative(file: string): string;
export declare function scopedFile(root: string, file: string, createParents?: boolean): Promise<string>;
export declare function readAgentFile(root: string, file: string): Promise<{
    file: string;
    content: string;
    sha256: string;
    lines: number;
}>;
export declare function writeAgentFile(root: string, file: string, content: string, expected: string): Promise<{
    file: string;
    sha256: string;
    bytes: number;
}>;
export declare function deleteAgentFile(root: string, file: string, expected: string): Promise<{
    file: string;
    deleted: boolean;
}>;
