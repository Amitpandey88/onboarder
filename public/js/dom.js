/** Delegated events may originate from a non-element node. */
export function eventElement(event) {
    return event.target instanceof HTMLElement ? event.target : null;
}
//# sourceMappingURL=dom.js.map