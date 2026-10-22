export declare function caddyfilePath(configFile?: string): string;
export declare function renderCaddyfile(settings: any): string;
export declare function httpsReadiness(settings: any, { configFile, resolve, probe, tool, running }?: Record<string, any>): Promise<{
    ok: boolean;
    checks: {
        id: string;
        ok: boolean;
        required: boolean;
        detail: string;
    }[];
    caddy: any;
    addresses: any[];
    local: any[];
}>;
export declare function httpsStatus(settings: any, configFile?: string): {
    enabled: boolean;
    domain: string;
    url: string;
    caddyfile: string;
    caddyInstalled: boolean;
    caddyVersion: string;
    configured: boolean;
    command: string;
};
export declare function writeCaddyfile(settings: any, configFile?: string): Promise<string>;
export declare function caddyValidate(settings: any, configFile?: string): Promise<{
    file: string;
    output: string;
}>;
export declare function caddyRun(settings: any, configFile?: string, action?: string): {
    action: string;
    file: string;
    output: string;
};
