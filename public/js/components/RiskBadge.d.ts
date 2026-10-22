export declare class RiskBadge extends HTMLElement {
    constructor();
    static get observedAttributes(): string[];
    connectedCallback(): void;
    attributeChangedCallback(name: any, oldValue: any, newValue: any): void;
    getScoreColor(score: any): "rgb(244, 67, 54)" | "rgb(255, 193, 7)" | "rgb(76, 175, 80)";
    render(): void;
    updateScore(score: any): void;
}
