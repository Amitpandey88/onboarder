/** OTLP JSON import. Deliberately omit arbitrary attributes, URLs and payloads. */
export function parseTelemetry(text) {
    if (text.length > 2 * 1024 * 1024)
        throw new Error('Telemetry import exceeds 2 MB.');
    const data = JSON.parse(text);
    if (!Array.isArray(data.resourceSpans) || data.resourceSpans.length > 100)
        throw new Error('Expected bounded OTLP JSON resourceSpans.');
    const spans = new Map();
    const value = (attrs, key) => {
        if (!Array.isArray(attrs))
            return '';
        const match = attrs.find(a => a?.key === key);
        return typeof match?.value?.stringValue === 'string' ? match.value.stringValue.slice(0, 200) : '';
    };
    for (const resource of data.resourceSpans) {
        const service = value(resource.resource?.attributes, 'service.name') || 'unknown-service';
        if (!Array.isArray(resource.scopeSpans))
            throw new Error('Expected OTLP scopeSpans.');
        for (const scope of resource.scopeSpans) {
            if (!Array.isArray(scope.spans))
                throw new Error('Expected OTLP spans.');
            for (const span of scope.spans) {
                if (spans.size >= 2000)
                    throw new Error('Telemetry import exceeds 2,000 spans.');
                if (!/^[a-f0-9]{32}$/i.test(span.traceId) || !/^[a-f0-9]{16}$/i.test(span.spanId) || span.parentSpanId && !/^[a-f0-9]{16}$/i.test(span.parentSpanId))
                    throw new Error('Invalid OTLP trace/span identifier.');
                let durationMs = null;
                if (/^\d{1,25}$/.test(String(span.startTimeUnixNano)) && /^\d{1,25}$/.test(String(span.endTimeUnixNano))) {
                    const duration = BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano);
                    if (duration >= 0n)
                        durationMs = Number(duration / 1000n) / 1000;
                }
                spans.set(span.traceId + ':' + span.spanId, { service, parent: span.parentSpanId ? span.traceId + ':' + span.parentSpanId : '',
                    name: typeof span.name === 'string' ? span.name.slice(0, 200) : '(unnamed)', route: value(span.attributes, 'http.route'), durationMs, error: span.status?.code === 2 });
            }
        }
    }
    const edges = new Map();
    for (const span of spans.values()) {
        const parent = spans.get(span.parent);
        if (parent && parent.service !== span.service) {
            const key = parent.service + '\0' + span.service;
            const edge = edges.get(key) || { from: parent.service, to: span.service, count: 0 };
            edge.count++;
            edges.set(key, edge);
        }
    }
    return { services: [...new Set([...spans.values()].map(s => s.service))], spans: spans.size, connections: [...edges.values()],
        operations: [...spans.values()].map(({ parent: _parent, ...operation }) => operation).slice(0, 200) };
}
//# sourceMappingURL=telemetry.js.map