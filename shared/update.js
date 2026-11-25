/** Portable update types, version comparison, and formatting helpers shared across server, CLI, and browser. */
const STRICT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const PARSE_SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
export const PACKAGE_NAME = 'codebase-onboarder';
export const REPO_SLUG = 'Amitpandey88/onboarder';
/** Validate a version string received from a registry before passing it to npm or building URLs. */
export function isValidVersionString(version) {
    return typeof version === 'string' && version.length <= 64 && STRICT_VERSION_RE.test(version);
}
/** Parse a SemVer 2.0.0 version string into comparable numeric and prerelease components. */
export function parseSemver(version) {
    if (typeof version !== 'string')
        return null;
    const match = PARSE_SEMVER_RE.exec(version.trim());
    if (!match)
        return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch))
        return null;
    const pre = match[4] ? match[4].split('.').filter(Boolean) : [];
    return { major, minor, patch, pre };
}
function compareIdentifiers(a, b) {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) {
        const diff = Number(a) - Number(b);
        return diff === 0 ? 0 : diff > 0 ? 1 : -1;
    }
    if (aNum !== bNum)
        return aNum ? -1 : 1;
    return a === b ? 0 : a > b ? 1 : -1;
}
/** Compare two SemVer strings: returns 1 if a > b, -1 if a < b, 0 if equal or unparseable. */
export function compareVersions(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb)
        return 0;
    for (const [x, y] of [[pa.major, pb.major], [pa.minor, pb.minor], [pa.patch, pb.patch]]) {
        if (x !== y)
            return x > y ? 1 : -1;
    }
    if (pa.pre.length === 0 && pb.pre.length === 0)
        return 0;
    if (pa.pre.length === 0)
        return 1;
    if (pb.pre.length === 0)
        return -1;
    const max = Math.max(pa.pre.length, pb.pre.length);
    for (let i = 0; i < max; i++) {
        const xi = pa.pre[i];
        const yi = pb.pre[i];
        if (xi === undefined)
            return -1;
        if (yi === undefined)
            return 1;
        const diff = compareIdentifiers(xi, yi);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
/** True only when both versions are valid SemVer and latest is strictly newer than current. */
export function isUpdateAvailable(current, latest) {
    if (!latest || !parseSemver(current) || !parseSemver(latest))
        return false;
    return compareVersions(latest, current) > 0;
}
/** Check simple lower-bound Node engine constraints such as ">=20" or ">=20.19.0". */
export function satisfiesMinimumNode(nodeVersion, engineRange) {
    if (!engineRange || typeof engineRange !== 'string')
        return true;
    const current = parseSemver(nodeVersion);
    if (!current)
        return true;
    const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(engineRange.trim());
    if (!match)
        return true;
    const required = `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}`;
    return compareVersions(`${current.major}.${current.minor}.${current.patch}`, required) >= 0;
}
export function releaseNotesUrl(version) {
    if (!isValidVersionString(version))
        return null;
    return `https://github.com/${REPO_SLUG}/releases/tag/v${version}`;
}
export function npmPackageUrl(version) {
    if (!isValidVersionString(version))
        return null;
    return `https://www.npmjs.com/package/${PACKAGE_NAME}/v/${version}`;
}
export function installMethodLabel(method) {
    switch (method) {
        case 'npm-global': return 'npm global install';
        case 'npm-local': return 'npm local dependency';
        case 'npx': return 'npx cache';
        case 'source': return 'Git source checkout';
        case 'standalone': return 'Standalone install';
    }
}
//# sourceMappingURL=update.js.map