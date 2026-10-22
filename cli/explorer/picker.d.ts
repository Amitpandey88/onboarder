export type PickerResult = {
    done: true;
    target: string | null;
    message: string;
} | {
    done: false;
    message: string;
};
/** A prompt-driven folder picker that can share an existing readline session. */
export declare class SourcePicker {
    private mode;
    private location;
    private page;
    private directories;
    private readonly pageSize;
    constructor(start?: string);
    get prompt(): string;
    view(): Promise<string>;
    choose(input: string): Promise<PickerResult>;
    private browseView;
    private validateTarget;
}
