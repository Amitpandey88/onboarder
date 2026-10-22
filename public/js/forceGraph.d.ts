import type { GraphFile, GraphLink } from './graphScene.js';
export declare function initForceGraph(canvas: HTMLCanvasElement, options?: any): {
    update: (files: GraphFile[], links: GraphLink[]) => void;
    resize: () => void;
    fit: () => void;
    reset: () => void;
    setActive: (value: boolean) => void;
    search: (query: string) => void;
    highlight: (path: string) => void;
    stats: () => {
        nodes: number;
        edges: number;
        labels: number;
        pixels: number;
        paints: number;
        pending: boolean;
        positions: {
            path: any;
            x: any;
            y: any;
        }[];
        viewport: {
            x: number;
            y: number;
            k: number;
        };
    };
    destroy: () => void;
};
