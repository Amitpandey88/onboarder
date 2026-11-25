import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Settings } from '../shared/contracts.js';
import type { UpdateEvent, UpdateStatus } from '../shared/update.js';
import { type ApplyUpdateOptions, type UpdateCheckOptions } from './update.js';
export interface UpdateRouteConfig {
    configPath?: string;
    boot?: {
        host: string;
        port: number;
        domain: string;
        https: boolean;
        mode?: string;
    };
    update?: {
        check?: (options: UpdateCheckOptions) => Promise<UpdateStatus>;
        apply?: (options: ApplyUpdateOptions, onEvent: (event: UpdateEvent) => void) => Promise<Extract<UpdateEvent, {
            type: 'done';
        }>>;
        isUpdating?: () => boolean;
        canRestart?: boolean;
        serverMode?: string | null;
        restart?: () => Promise<void> | void;
        fetchImpl?: typeof fetch;
    };
}
export declare function handleUpdateStatus(res: ServerResponse, url: URL, config: UpdateRouteConfig, settings: Settings): Promise<void>;
export declare function handleUpdateInstall(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown> | null, config: UpdateRouteConfig, settings: Settings): Promise<void>;
export declare function handleUpdateRestart(res: ServerResponse, config: UpdateRouteConfig): Promise<void>;
