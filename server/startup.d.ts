export declare const LABEL = "com.onboarder.server";
export declare const UNIT = "onboarder.service";
export declare function cliEntry(): string;
export declare function startupCommand(configFile?: string, { node, entry }?: Record<string, any>): any[];
export declare function renderLaunchAgent({ configFile, log, ...options }?: Record<string, any>): string;
export declare function renderSystemdUnit({ configFile, log, ...options }?: Record<string, any>): string;
export declare function renderWindowsStartup({ configFile, log, ...options }?: Record<string, any>): string;
export declare function startupTarget({ platform, home, env }?: Record<string, any>): {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderLaunchAgent;
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
    daemonReload?: undefined;
} | {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderSystemdUnit;
    daemonReload: string[];
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
};
export declare function startupInstalled(target?: {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderLaunchAgent;
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
    daemonReload?: undefined;
} | {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderSystemdUnit;
    daemonReload: string[];
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
}): Promise<boolean>;
export declare function startupStatus(target?: {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderLaunchAgent;
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
    daemonReload?: undefined;
} | {
    kind: string;
    platform: any;
    label: string;
    path: string;
    render: typeof renderSystemdUnit;
    daemonReload: string[];
    load: string[];
    unload: string[];
    status: string[];
    hint: string;
}, { run }?: Record<string, any>): Promise<{
    kind: string;
    supported: boolean;
    label: string;
    path: string;
    installed: boolean;
    active: any;
    detail: string;
    hint: string;
}>;
export declare function installStartup({ configFile, log, target, run }?: Record<string, any>): Promise<{
    path?: undefined;
    ok: boolean;
    reason: string;
    loaded?: undefined;
    output?: undefined;
    error?: undefined;
} | {
    reason?: undefined;
    ok: boolean;
    path: any;
    loaded: boolean;
    output: string;
    error?: undefined;
} | {
    reason?: undefined;
    loaded?: undefined;
    ok: boolean;
    path: any;
    output: any;
    error: any;
}>;
export declare function removeStartup({ target, run }?: Record<string, any>): Promise<{
    path?: undefined;
    output?: undefined;
    ok: boolean;
    reason: string;
} | {
    reason?: undefined;
    ok: boolean;
    path: any;
    output: string;
}>;
