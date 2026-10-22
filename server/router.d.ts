import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Settings } from '../shared/contracts.js';
import type { TeamMember } from './intelligence/team.js';
interface RouteContext {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    body: any;
    rest: string;
    config: any;
    settings: Settings;
    member?: TeamMember | null;
}
interface Route {
    method: string;
    path?: string;
    prefix?: string;
    body?: boolean;
    raw?: boolean;
    sameOrigin?: boolean;
    run(context: RouteContext): unknown;
}
export declare const routes: readonly Readonly<{
    method: string;
    path?: string;
    prefix?: string;
    body?: boolean;
    raw?: boolean;
    sameOrigin?: boolean;
    run(context: RouteContext): unknown;
}>[];
export declare function matchRoute(method: any, pathname: any): {
    route: Route;
    rest: any;
};
export declare function createRouter(config: any): (req: any, res: any) => Promise<unknown>;
export {};
