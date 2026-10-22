export declare function stopIntelligence(): void;
export declare function renderIntelligence(container: HTMLElement, context: {
    scanId?: string;
    scan: {
        root: string;
        name: string;
    };
}): Promise<void>;
