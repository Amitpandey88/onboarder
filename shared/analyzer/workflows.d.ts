export declare function analyzeWorkflows(source: any): Promise<any[]>;
export declare function parseWorkflowYaml(text: any, filePath?: string, fileName?: string): {
    file: string;
    fileName: string;
    name: string;
    triggers: any[];
    jobs: any[];
};
