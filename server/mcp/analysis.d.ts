import { scanIndex } from '../../shared/analyzer/graph.js';
import { explainFile, explainFolder } from '../../shared/analyzer/explainLocal.js';
import { docFileRow, fileFactsLine, fileStaticDoc, folderStaticDoc } from '../../shared/analyzer/docs.js';
import { baseName, dirOf } from '../../shared/analyzer/pathUtil.js';
import { searchDocuments } from '../apiSearch.js';
export declare function cachedAnalysis(root: any): any;
export declare function cachedRoots(): any[];
export declare function clearAnalysisCache(): void;
export declare class ToolError extends Error {
    name: string;
    constructor(message: any);
}
export declare function analyzeRepository(rootInput: any, { force }?: Record<string, any>): Promise<any>;
export declare function filesUnder(analysis: any, folder: any): any;
export declare function parsedFilesUnder(analysis: any, folder: any): any;
export declare function resolveIn(analysis: any, relPath: any): {
    abs: string;
    rel: string;
};
export declare function fileIn(analysis: any, relPath: any): {
    abs: string;
    rel: string;
    file: any;
};
export declare function readFileText(analysis: any, relPath: any): Promise<{
    path: string;
    text: string;
}>;
export { scanIndex, dirOf, baseName, explainFile, explainFolder, docFileRow, fileFactsLine, fileStaticDoc, folderStaticDoc, searchDocuments, };
