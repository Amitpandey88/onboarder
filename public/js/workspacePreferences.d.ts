export interface Viewpoint {
    name: string;
    path: string;
    filter: string;
    viewport?: {
        scale: number;
        tx: number;
        ty: number;
    };
    expanded?: string[];
}
export declare function rememberView(root: string, view: Viewpoint): void;
export declare function rememberedView(root: string): Viewpoint | null;
export declare function savedBookmarks(root: string): (Viewpoint & {
    title: string;
})[];
export declare function saveBookmark(root: string, title: string, viewpoint: Viewpoint): void;
