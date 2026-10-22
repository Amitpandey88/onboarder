export declare function detectLicenseFromText(text: any): {
    id: string;
    name: string;
    type: string;
};
export declare function classifyLicenseType(licenseId: any): "copyleft" | "custom" | "permissive" | "unknown" | "weak-copyleft";
export declare function analyzeLicenses(source: any, manifest?: Record<string, any>): Promise<{
    projectLicense: any;
    sbom: any[];
    counts: {
        permissive: number;
        copyleft: number;
        weakCopyleft: number;
        unknown: number;
        total: number;
    };
    complianceStatus: string;
}>;
