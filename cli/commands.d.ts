export declare function runSetup({ flags, out, err, version }?: Record<string, any>): any;
export declare function serverDetails(started: any, { configFile, pid, mode, logFile }?: Record<string, any>): {
    rows: {
        label: string;
        value: string;
    }[];
    urls: import("../shared/contracts.js").ServerUrls;
    mode: any;
};
export declare function watchResize(render: any, stream?: NodeJS.WriteStream & {
    fd: 1;
}): (..._args: unknown[]) => void;
export declare function runStart({ flags, out, err }?: Record<string, any>): any;
export declare function runStartBackground({ flags, out, err }?: Record<string, any>): any;
export declare function runStatus({ flags, out }?: Record<string, any>): Promise<number>;
export declare function humanDuration(ms: any): string;
export declare function runStop({ flags, out, err }?: Record<string, any>): Promise<0 | 1>;
export declare function runRestart(options?: Record<string, any>): Promise<any>;
export declare function runLogs({ flags, out, err }?: Record<string, any>): Promise<0 | 1 | 2>;
export declare function runStartup(action?: string, { flags, out, err }?: Record<string, any>): Promise<0 | 1>;
export declare function runConfig(sub: any, args: any, { flags, out }?: Record<string, any>): Promise<number>;
export declare function runConfigKey(action: any, args: any, { flags, out, err }?: Record<string, any>): Promise<number>;
export declare function runConfigReset({ flags, out, err }?: Record<string, any>): Promise<0 | 1>;
export declare function runDoctor({ flags, out }?: Record<string, any>): Promise<0 | 1>;
export declare function runHttps(action?: string, { flags, out, err }?: Record<string, any>): Promise<0 | 1>;
export declare function runTunnel(kind: any, { flags, out, err }?: Record<string, any>): Promise<unknown>;
