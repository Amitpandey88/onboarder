import { normalizeScanOptions } from '../shared/analyzer/scanControl.js';
export function scanOptionsFromFlags(flags) {
    const options = {};
    for (const key of ['maxFiles', 'maxFileSize', 'readConcurrency']) {
        if (flags[key] !== undefined)
            options[key] = Number(flags[key]);
    }
    normalizeScanOptions(options);
    return options;
}
//# sourceMappingURL=scanOptions.js.map