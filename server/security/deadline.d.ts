/** Keep a CLI operation alive until its deadline; AbortSignal.timeout is unref'ed on Node 20. */
export declare function operationDeadline(timeoutMs: number, parent?: AbortSignal): {
    signal: AbortSignal;
    dispose: () => void;
};
