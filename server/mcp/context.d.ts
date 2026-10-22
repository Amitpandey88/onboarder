export declare const CONTEXT_CAPABILITIES: {
    tools: {
        listChanged: boolean;
    };
    resources: {
        subscribe: boolean;
        listChanged: boolean;
    };
    prompts: {
        listChanged: boolean;
    };
};
export declare function repositoryResourceUri(root: string, view: string, file?: string): string;
export declare function resourceDefinitions(root?: string): {
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
}[];
export declare function resourceTemplates(root?: string): {
    uriTemplate: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
}[];
export declare function readResource(uri: string, options?: {
    root?: string;
    readSource?: (file: string) => Promise<unknown>;
}): Promise<{
    contents: {
        uri: string;
        mimeType: string;
        text: string;
    }[];
}>;
export declare function promptDefinitions(scoped?: boolean): {
    name: string;
    title: string;
    description: string;
    arguments: {
        name: string;
        description: string;
        required: boolean;
    }[];
}[];
export declare function getPrompt(name: string, args?: unknown, root?: string): {
    description: string;
    messages: {
        role: string;
        content: {
            type: string;
            text: string;
        };
    }[];
};
