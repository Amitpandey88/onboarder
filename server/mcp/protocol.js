import { readFileSync } from 'node:fs';
export const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
export const PROTOCOL_VERSION = '2025-11-25';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export function negotiateVersion(requested) {
    return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
}
export function rpcResult(id, value) {
    return { jsonrpc: '2.0', id, result: value };
}
export function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
}
export function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
// Return a protocol error for malformed requests; valid notifications stay silent.
export function invalidRequest(msg) {
    const validId = msg?.id === null || typeof msg?.id === 'string' || (typeof msg?.id === 'number' && Number.isFinite(msg.id));
    if (!isObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string'
        || (Object.hasOwn(msg, 'id') && !validId)) {
        return rpcError(validId ? msg.id : null, -32600, 'Invalid JSON-RPC request.');
    }
    return null;
}
// Validate the JSON Schema subset used by our tool catalogs, in both MCP servers.
// Nested open objects (such as engine options) remain open when declared that way.
export function validateArguments(schema, value, label = 'arguments') {
    const matches = schema.type === 'object' ? isObject(value)
        : schema.type === 'array' ? Array.isArray(value)
            : schema.type === 'integer' ? typeof value === 'number' && Number.isSafeInteger(value)
                : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
                    : schema.type ? typeof value === schema.type : true;
    if (!matches)
        throw new Error(`${label} must be ${schema.type === 'object' ? 'an object' : 'a ' + schema.type}.`);
    if (schema.enum && !schema.enum.includes(value))
        throw new Error(`${label} must be one of: ${schema.enum.join(', ')}.`);
    if (typeof value === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) {
        throw new Error(`${label} is outside the allowed range ${schema.minimum ?? '−∞'}–${schema.maximum ?? '∞'}.`);
    }
    if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))) {
        throw new Error(`${label} has an invalid length.`);
    }
    if (Array.isArray(value)) {
        if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
            throw new Error(`${label} has too many or too few items.`);
        if (schema.items)
            value.forEach((item, i) => validateArguments(schema.items, item, `${label}[${i}]`));
    }
    if (isObject(value) && schema.type === 'object') {
        for (const key of schema.required || [])
            if (!Object.hasOwn(value, key))
                throw new Error(`A required argument is missing: ${key}.`);
        for (const [key, item] of Object.entries(value)) {
            if (Object.hasOwn(schema.properties || {}, key))
                validateArguments(schema.properties[key], item, `${label}.${key}`);
            else if (schema.additionalProperties === false)
                throw new Error(`Unknown argument: ${key}; repository paths cannot be overridden in scoped tools.`);
        }
    }
}
export function initializeResult(params, serverInfo, capabilities, instructions) {
    if (!isObject(params) || typeof params.protocolVersion !== 'string' || !isObject(params.capabilities)
        || !isObject(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') {
        throw new Error('initialize needs protocolVersion, capabilities, and clientInfo (name and version).');
    }
    return { protocolVersion: negotiateVersion(params.protocolVersion), serverInfo, capabilities, instructions };
}
//# sourceMappingURL=protocol.js.map