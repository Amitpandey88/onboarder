export declare class FileChip extends HTMLElement {
    title: any;
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    attributeChangedCallback(name: any, oldValue: any, newValue: any): void;
    getRiskColor(risk: any): "rgb(244, 67, 54)" | "rgb(255, 193, 7)" | "rgb(76, 175, 80)";
    render(): void;
}
