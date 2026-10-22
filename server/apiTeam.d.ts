import type { ServerResponse } from 'node:http';
import type { TeamMember } from './intelligence/team.js';
export declare function handleTeamComments(res: ServerResponse, scanId: unknown, body: Record<string, unknown> | null, directory: string | undefined, member?: TeamMember | null): Promise<void>;
