export function withTransition(callback) {
    // Switching a workbench view should not snapshot and animate the entire page.
    // That retains both heavy views during a transition and delays rapid tab changes.
    callback();
}
export function setupViewTransitionNames(elements) {
    // Utility for adding transition names if needed
    Object.entries(elements).forEach(([id, name]) => {
        const el = document.getElementById(id);
        if (el)
            el.style.viewTransitionName = name;
    });
}
//# sourceMappingURL=transitions.js.map