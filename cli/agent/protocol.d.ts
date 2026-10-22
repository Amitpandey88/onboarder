import type { AgentEvent } from './contracts.js';
/** Only documented Hermes JSONL frames count as progress or completion. */
export declare function parseAgentEvent(line: string): AgentEvent;
