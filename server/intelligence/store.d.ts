import type { Snapshot, WorkspaceState } from '../../shared/intelligence/contracts.js';
export declare const emptyWorkspaceState: () => WorkspaceState;
export declare function validateWorkspaceState(value: unknown): WorkspaceState;
interface Stored {
    schemaVersion: 1;
    snapshots: Snapshot[];
    state: WorkspaceState;
}
export declare class IntelligenceStore {
    readonly directory: string;
    constructor(directory?: string);
    private file;
    private load;
    read(root: string): Promise<Stored>;
    private update;
    saveState(root: string, state: unknown): Promise<Stored>;
    saveSnapshot(root: string, snapshot: Snapshot): Promise<Stored>;
    clear(root: string): Promise<Stored>;
}
export {};
