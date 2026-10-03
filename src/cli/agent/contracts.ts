export const AGENT_MODES = ['ask', 'review', 'triage', 'implement', 'pr', 'github'] as const;
export type AgentMode = typeof AGENT_MODES[number];
export interface AgentRequest {
  mode: AgentMode;
  root: string;
  task: string;
  pr?: number;
  issue?: number;
  maxTurns?: number;
  timeoutSeconds?: number;
  allowChecks?: boolean;
  allowGithubWrites?: boolean;
  dryRun?: boolean;
  model?: string;
  provider?: string;
  resume?: string;
  base?: string;
}
export interface RunManifest {
  schemaVersion: 1;
  id: string;
  mode: AgentMode;
  sourceRoot: string;
  root: string;
  repository: string | null;
  remote: string | null;
  branch: string | null;
  baseBranch: string | null;
  task: string;
  pr?: number;
  issue?: number;
  permissions: { files: boolean; checks: boolean; github: boolean };
  startedAt: string;
  timeoutSeconds: number;
  maxTurns: number;
  auditFile: string;
}
export interface AgentEvent {
  type: 'system' | 'text' | 'tool_use' | 'tool_result' | 'result';
  subtype?: string;
  name?: string;
  text?: string;
  session_id?: string;
  exit_code?: number;
  error?: string;
  is_error?: boolean;
  tokens?: Record<string, number>;
  duration_ms?: number;
}
export interface AgentResult {
  id: string;
  status: 'completed' | 'failed' | 'cancelled';
  mode: AgentMode;
  answer: string;
  sessionId: string | null;
  workspace: string;
  branch: string | null;
  repository: string | null;
  auditFile: string;
  completedAt: string;
  tokens?: Record<string, number>;
}
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (args: Record<string, unknown>) => Promise<unknown>;
}
