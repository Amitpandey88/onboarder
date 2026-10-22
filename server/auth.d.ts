export declare const SESSION_COOKIE = "onboarder_session";
export declare const SESSION_TTL_SECONDS: number;
export declare function createSession(settings: any, now?: number): string;
export declare function hasValidSession(req: any, settings: any, now?: number): boolean;
export declare function sessionCookie(req: any, settings: any, { clear }?: Record<string, any>): string;
