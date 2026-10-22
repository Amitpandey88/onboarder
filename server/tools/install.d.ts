export declare function gitleaksAsset(platform: any, arch: any): {
    sha256: any;
    maxBytes: number;
    redirectOrigins: string[];
    url: string;
    file: string;
    binary: string;
};
export declare function plansFor(toolId: any, platform?: NodeJS.Platform): any;
export declare function planAvailability(toolId: any, options?: Record<string, any>): any;
export declare function isInstalling(toolId: any): boolean;
export declare function installTool(toolId: any, onEvent?: (event: Record<string, unknown>) => void): Promise<any>;
