export declare function resolveAsset(urlPath: any, { publicDir, sharedDir }: {
    publicDir: any;
    sharedDir: any;
}): string;
export declare function cacheControlFor(file: any): "no-cache" | "public, max-age=86400";
export declare function serveStatic(res: any, urlPath: any, dirs: any): Promise<void>;
