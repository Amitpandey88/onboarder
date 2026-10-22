import type { ServerResponse } from 'node:http';
import { IntelligenceStore } from './intelligence/store.js';
export declare function handleIntelligence(res: ServerResponse, body: unknown, store?: IntelligenceStore): Promise<void>;
