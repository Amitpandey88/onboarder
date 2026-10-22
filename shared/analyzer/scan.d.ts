import type { FileSource, ScanOptions, ImportEdge, ScannedFile } from '../contracts.js';
export { DEFAULT_LIMITS } from './scanControl.js';
export declare function scanRepo(source: FileSource, options?: ScanOptions): Promise<{
    root: string;
    name: any;
    scannedAt: string;
    stats: {
        reused: number;
        filesTotal: number;
        filesParsed: number;
        skipped: number;
        skips: {
            ignored: number;
            vendorDir: number;
            notSource: number;
            listFailed: number;
            notCode: number;
            readFailed: number;
            tooLarge: number;
            analyzeFailed: number;
        };
        truncated: any;
        edgeCount: number;
        imports: {
            total: number;
            internal: number;
            external: number;
            unresolved: number;
            confidence: number;
            worst: any[];
        };
        tookMs: number;
        languages: Record<string, number>;
        languageLoc: Record<string, number>;
    };
    allFiles: string[];
    files: ScannedFile[];
    edges: ImportEdge[];
    externals: {
        name: any;
        usedBy: any[];
    }[];
    folders: {
        path: string;
        name: string;
        depth: number;
        fileCount: number;
        loc: number;
        comment: number;
        blank: number;
        size: number;
        langs: Record<string, number>;
        hasReadme: boolean;
        docRatio: number;
    }[];
    workflows: any[];
    sbom: any;
    license: any;
    licenseReport: any;
} & {
    tempId?: string;
    gitUrl?: string;
}>;
