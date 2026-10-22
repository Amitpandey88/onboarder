import type { ServerResponse } from 'node:http';
export declare function handleScan(res: ServerResponse, body: unknown, { projectRoot }: {
    projectRoot: string;
}): Promise<void>;
export declare function handleCleanup(res: any, cloneId: any): Promise<void>;
