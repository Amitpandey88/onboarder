/** In-page prompts also work in embedded browsers that suppress window.prompt. */
export declare function requestText(title: string, maximum?: number): Promise<string | null>;
