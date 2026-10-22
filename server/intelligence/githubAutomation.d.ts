import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReviewReport } from '../../shared/review/contracts.js';
import { GithubClient } from '../../cli/agent/github.js';
interface Job {
    id: string;
    repository: string;
    number: number;
    head: string;
    base: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'stale';
    updatedAt: string;
    report?: ReviewReport;
    error?: string;
    checkId?: number;
}
export declare function verifyWebhook(secret: string, raw: Buffer, signature: string): boolean;
export declare function appJwt(appId: string, privateKey: string, now?: number): string;
export declare class GithubAutomation {
    readonly file: string;
    readonly secret: string;
    private createClient?;
    private pending;
    private running;
    private initialized;
    private starting;
    private intake;
    constructor(file: string, secret: string, createClient?: (repository: string) => GithubClient);
    private config;
    private folder;
    assertReadRepository(repository: string): Promise<{
        installationId?: number;
    }>;
    /** Triage reuses App authentication while requesting read-only installation permissions. */
    readClient(repository: string, signal?: AbortSignal): Promise<GithubClient>;
    private save;
    jobs(): Promise<Job[]>;
    start(): Promise<void>;
    accept(event: string, payload: any): Promise<{
        accepted: boolean;
        ping: boolean;
        ignored?: undefined;
        duplicate?: undefined;
        id?: undefined;
    } | {
        ping?: undefined;
        accepted: boolean;
        ignored: boolean;
        duplicate?: undefined;
        id?: undefined;
    } | {
        ping?: undefined;
        ignored?: undefined;
        accepted: boolean;
        id: string;
        duplicate: boolean;
    } | {
        ping?: undefined;
        ignored?: undefined;
        duplicate?: undefined;
        accepted: boolean;
        id: string;
    }>;
    private acceptSerialized;
    idle(): Promise<void>;
    private drain;
    private run;
}
export declare function handleGithubWebhook(req: IncomingMessage, res: ServerResponse, automation?: GithubAutomation): Promise<void>;
export {};
