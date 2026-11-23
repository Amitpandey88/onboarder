import type { ChangeStackResult } from '../../shared/changeStack/contracts.js';
interface ChangeStackState {
    result: ChangeStackResult | null;
    base: string;
    head: string;
    semantic: boolean;
    error: string;
    running: boolean;
    autoRun: boolean;
    overlay: 'changes' | 'context';
    origin: 'triage' | null;
}
interface ChangeStackContext {
    scanId: string | null;
    scan: {
        root: string;
    };
    changeStack: ChangeStackState;
}
/** Stop the in-flight build when the view changes without discarding the last completed stack. */
export declare function stopChangeStack(): void;
export declare function renderChangeStack(container: HTMLElement, context: ChangeStackContext): void;
export {};
