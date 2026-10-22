export declare function onboarderBinDir(home?: string): string;
export declare function candidateNames(cmd: any, platform?: NodeJS.Platform, pathext?: string): any[];
export declare function extraSearchDirs(platform?: NodeJS.Platform, home?: string): string[];
export declare function splitPath(pathValue: any, platform?: NodeJS.Platform): string[];
export declare function findOnPath(cmd: any, options?: Record<string, any>): string;
export declare function spawnArgv(argv: any, platform?: NodeJS.Platform): {
    command: any;
    args: any;
};
