export declare function fixId(id: string): string;
export declare class FixStore {
    home: string;
    directory: string;
    constructor(home?: string);
    private directoryReady;
    private key;
    write(kind: 'proposal' | 'run', id: string, value: unknown): Promise<void>;
    read<T>(kind: 'proposal' | 'run', id: string): Promise<T>;
    lock<T>(id: string, action: () => Promise<T>): Promise<T>;
}
