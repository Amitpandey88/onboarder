import type { Settings } from '../shared/contracts.js';
export declare const PROVIDER_PRESETS: {
    none: {
        label: string;
        baseUrl: string;
    };
    'openai-compatible': {
        label: string;
        baseUrl: string;
    };
    ollama: {
        label: string;
        baseUrl: string;
    };
    openrouter: {
        label: string;
        baseUrl: string;
    };
    custom: {
        label: string;
        baseUrl: string;
    };
};
export declare const TUNNEL_CHOICES: {
    value: string;
    label: string;
    hint: string;
}[];
export declare function validPort(value: any): string;
export declare function validDomain(value: any): string;
export declare function validEmail(value: any): string;
export declare function buildSteps(current?: Settings): ({
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    default: string;
    validate?: undefined;
    choices?: undefined;
    when?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    default: string;
    validate: typeof validEmail;
    choices?: undefined;
    when?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    choices: {
        value: string;
        label: string;
        hint: string;
    }[];
    default: (answers: any) => any;
    when: (a: any) => boolean;
    validate?: undefined;
    hint?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    default: string;
    validate: typeof validPort;
    hint?: undefined;
    choices?: undefined;
    when?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    default: string;
    validate: typeof validDomain;
    when: (a: any) => boolean;
    choices?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    default: boolean;
    when: (a: any) => boolean;
    validate?: undefined;
    choices?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    choices: {
        value: string;
        label: string;
        hint: string;
    }[];
    default: string;
    when: (a: any) => boolean;
    validate?: undefined;
    hint?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    validate: (v: any) => string;
    when: (a: any) => boolean;
    choices?: undefined;
    default?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    choices: {
        value: string;
        label: string;
        hint: string;
    }[];
    default: string;
    validate?: undefined;
    hint?: undefined;
    when?: undefined;
} | {
    id: string;
    section: string;
    type: string;
    question: string;
    default: (a: any) => any;
    validate: (v: any) => string;
    when: (a: any) => boolean;
    hint?: undefined;
    choices?: undefined;
} | {
    validate?: undefined;
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    default: string;
    when: (a: any) => boolean;
    choices?: undefined;
} | {
    validate?: undefined;
    id: string;
    section: string;
    type: string;
    question: string;
    hint: string;
    choices: {
        value: string;
        label: string;
        hint: string;
    }[];
    default: string;
    when: (a: any) => boolean;
} | {
    validate?: undefined;
    hint?: undefined;
    choices?: undefined;
    when?: undefined;
    id: string;
    section: string;
    type: string;
    question: string;
    default: boolean;
})[];
export declare function pendingSteps(steps: any, answers?: Record<string, any>): any;
export declare function unansweredSteps(steps: any, answers?: Record<string, any>): any;
export declare function defaultOf(step: any, answers: any): any;
export declare function answersToSettings(current: any, answers: any): Settings;
export declare function applyFlags(current: any, flags?: Record<string, any>): {
    patch: Record<string, any>;
    settings: Settings;
};
export declare function summaryLines(settings: any, { revealKey }?: Record<string, any>): any[][];
