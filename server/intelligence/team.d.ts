import type { IncomingMessage } from 'node:http';
export interface TeamMember {
    id: string;
    name: string;
    role: 'viewer' | 'reviewer';
    roots: string[];
    tokenHash: string;
    enabled: boolean;
}
interface TeamFile {
    schemaVersion: 1;
    members: TeamMember[];
}
export declare class TeamDirectory {
    readonly file: string;
    constructor(file: string);
    read(): Promise<TeamFile>;
    private change;
    add(name: string, role: string, roots: string[]): Promise<{
        id: string;
        token: string;
        name: string;
        role: "reviewer" | "viewer";
        roots: string[];
    }>;
    revoke(id: string): Promise<void>;
    authenticate(token: string): Promise<TeamMember>;
    fromRequest(req: IncomingMessage, signingKey: string): Promise<TeamMember>;
}
export declare function memberCookie(member: TeamMember, key: string, secure: boolean): string;
export declare function authorizeMember(member: TeamMember, pathname: string, body: Record<string, unknown>, query: URLSearchParams, sessionRoot: (id: string) => string | undefined): Promise<void>;
export {};
