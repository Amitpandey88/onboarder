export interface ObservedTelemetry {
    services: string[];
    spans: number;
    connections: {
        from: string;
        to: string;
        count: number;
    }[];
    operations: {
        service: string;
        name: string;
        route: string;
        durationMs: number | null;
        error: boolean;
    }[];
}
/** OTLP JSON import. Deliberately omit arbitrary attributes, URLs and payloads. */
export declare function parseTelemetry(text: string): ObservedTelemetry;
