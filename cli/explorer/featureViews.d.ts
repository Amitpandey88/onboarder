/** Terminal projections of data already used by the web views. */
interface WorkflowStep {
    name: string;
    uses?: string | null;
}
interface WorkflowJob {
    name: string;
    runsOn?: string;
    needs?: string[];
    steps?: WorkflowStep[];
}
interface Workflow {
    name: string;
    file: string;
    triggers?: string[];
    jobs?: WorkflowJob[];
}
interface License {
    id: string;
    name?: string;
    type?: string;
}
interface Package {
    name: string;
    version: string;
    ecosystem: string;
    isDev: boolean;
    license?: License;
}
interface LicenseReport {
    projectLicense: License;
    sbom: Package[];
    counts: {
        total: number;
        permissive: number;
        copyleft: number;
        weakCopyleft: number;
        unknown: number;
    };
    complianceStatus: string;
}
interface DiffLine {
    type: 'add' | 'del' | 'context';
    text: string;
}
interface DiffHunk {
    header: string;
    lines: DiffLine[];
}
interface DiffFile {
    oldPath: string;
    newPath: string;
    status: string;
    additions: number;
    deletions: number;
    hunks: DiffHunk[];
}
interface GitDiff {
    files: DiffFile[];
    stats: {
        additions: number;
        deletions: number;
    };
}
interface ToolStatus {
    label: string;
    kind: string;
    available: boolean;
    how?: string | null;
    reason?: string | null;
    purpose?: string;
}
interface Finding {
    path?: string;
    file?: string;
    line?: number;
    severity?: string;
    rule?: string;
    message?: string;
    tool?: string;
}
interface AnalysisPass {
    id: string;
    label: string;
    ok: boolean;
    available: boolean;
    findings: Finding[];
    reason?: string;
    ms?: number;
}
interface AnalysisReport {
    passes: AnalysisPass[];
    findings: Finding[];
    ms: number;
}
export declare function formatWorkflows(workflows: Workflow[]): string;
export declare function formatSbom(report: LicenseReport | null | undefined, filter?: string): string;
export declare function formatDiff(diff: GitDiff, importers: Record<string, string[]>, totalFiles: number, selectedPath?: string): string;
export declare function formatEngines(status: Record<string, ToolStatus>): string;
export declare function formatAtlas(entries: string[], hubs: Array<{
    path: string;
}>, folders: Array<{
    path: string;
}>): string;
interface FileInspector {
    path: string;
    role: string;
    loc: number;
    complexity: number;
    risk: number;
    imports: string[];
    importers: string[];
    exports: Array<{
        name: string;
    }>;
    findings: Array<{
        severity?: string;
        rule?: string;
        message?: string;
        line?: number;
    }>;
}
export declare function formatInspector(file: FileInspector): string;
export declare function formatDeepAnalysis(report: AnalysisReport): string;
export {};
