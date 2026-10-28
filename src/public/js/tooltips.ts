/** Portalled text-only tooltips stay readable outside clipped toolbar/file rows. */
export function initWorkspaceTooltips() {
  const tip = document.getElementById('workspaceTooltip')!;
  let owner: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout>;
  let priorDescription: string | null = null;
  let positionFrame = 0;
  function position(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    tip.style.left = Math.max(10, Math.min(window.innerWidth - tip.offsetWidth - 10, rect.left)) + 'px';
    tip.style.top = (rect.bottom + tip.offsetHeight + 16 < window.innerHeight ? rect.bottom + 8 : Math.max(10, rect.top - tip.offsetHeight - 8)) + 'px';
  }
  function hide() {
    cancelAnimationFrame(positionFrame); positionFrame = 0;
    clearTimeout(timer); tip.hidden = true;
    if (owner) { if (priorDescription) owner.setAttribute('aria-describedby', priorDescription); else owner.removeAttribute('aria-describedby'); }
    owner = null;
  }
  function show(target: HTMLElement, immediate = false) {
    const label = target.dataset.tooltip || target.title || (target.matches('.inspector-title,.inspector-path') ? target.textContent : '');
    if (!label?.trim()) return;
    hide(); owner = target; priorDescription = target.getAttribute('aria-describedby');
    timer = setTimeout(() => {
      if (!target.isConnected || owner !== target) return;
      tip.textContent = target.dataset.tooltip || target.title || target.textContent || label; tip.hidden = false; target.setAttribute('aria-describedby', tip.id);
      position(target);
    }, immediate ? 0 : 180);
  }
  const find = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tooltip],[title],.inspector-title,.inspector-path') : null;
  document.addEventListener('pointerover', event => { const target = find(event); if (target && target !== owner) show(target); });
  document.addEventListener('pointerout', event => { if (owner && event.target instanceof Node && owner.contains(event.target) && document.activeElement !== owner && (!(event.relatedTarget instanceof Node) || !owner.contains(event.relatedTarget))) hide(); });
  document.addEventListener('focusin', event => { const target = find(event); if (target) show(target, true); });
  document.addEventListener('focusout', event => { if (owner && event.target instanceof Node && owner.contains(event.target) && !owner.matches(':hover')) hide(); });
  document.addEventListener('pointerdown', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  function reposition() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => { positionFrame = 0; if (owner && !tip.hidden) position(owner); });
  }
  document.addEventListener('scroll', event => {
    // Editor/map scrolling must not dismiss an unrelated toolbar tooltip.
    if (!owner || event.target !== document && !(event.target instanceof Element && event.target.contains(owner))) return;
    if (document.activeElement === owner || owner.matches(':hover')) reposition(); else hide();
  }, true);
  window.addEventListener('resize', () => { if (owner && (document.activeElement === owner || owner.matches(':hover'))) reposition(); else hide(); });
}
