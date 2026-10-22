export declare function pidPath(configFile: any): string;
export declare function readPidFile(configFile: any): number;
export declare function pidIsAlive(pid: any): boolean;
export declare function writePidFile(configFile: any): void;
export declare function removePidFile(configFile: any, pid?: number): void;
export declare function runInfoPath(configFile: any): string;
export declare function writeRunInfo(configFile: any, info?: Record<string, any>): void;
export declare function readRunInfo(configFile: any): any;
export declare function removeRunInfo(configFile: any): void;
