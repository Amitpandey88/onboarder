export declare class WizardCancelled extends Error {
    code: string;
    constructor();
}
export declare function runSteps(steps: any, answers?: Record<string, any>, io?: Record<string, any>): Promise<Record<string, any>>;
