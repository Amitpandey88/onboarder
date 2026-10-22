export declare function blankComments(source: any, { block, line, lineChar }?: Record<string, any>): any;
export declare function jsCodeMask(source: any): string;
export declare function lineOf(source: any, index: any): number;
export declare function lineCounter(source: any): (index: any) => number;
export declare function braceBodyEnd(source: any, openIndex: any): any;
export declare function uniqueBy(items: any, key: any): any[];
export declare function callsWithin(body: any, names: any): any[];
export declare function declarationOrder(fns: any): Map<any, any>;
