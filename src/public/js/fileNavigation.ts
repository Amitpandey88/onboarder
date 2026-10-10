// A file selection stays in the current view until the reader picks a destination.
export function createFileNavigation(onChoose) {
  const panel = document.createElement('div');
  panel.className = 'file-navigation';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Open file');
  const title = document.createElement('div');
  title.className = 'file-navigation-title';
  const choices = document.createElement('div');
  choices.className = 'file-navigation-choices';
  panel.append(title, choices);
  document.body.appendChild(panel);
  let path = '';
  let anchor: HTMLElement | null = null;

  const close = (restoreFocus = false) => {
    panel.hidden = true;
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  };
  for (const [target, label] of [['deep', 'Deep Dive'], ['code', 'Code'], ['docs', 'Docs']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-ghost';
    button.textContent = label;
    button.addEventListener('click', () => {
      close();
      onChoose(path, target);
    });
    choices.appendChild(button);
  }
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !panel.contains(event.target as Node)) close();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'Tab') {
      const buttons = [...choices.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  window.addEventListener('resize', () => close());
  return {
    close,
    show(filePath: string, source: HTMLElement) {
      path = filePath;
      anchor = source;
      title.textContent = filePath;
      const rect = source.getBoundingClientRect();
      panel.hidden = false;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8));
      const below = rect.bottom + 8;
      const top = below + panel.offsetHeight <= window.innerHeight - 8
        ? Math.max(8, below)
        : Math.max(8, Math.min(rect.top - panel.offsetHeight - 8, window.innerHeight - panel.offsetHeight - 8));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      choices.querySelector('button').focus({ preventScroll: true });
    },
  };
}
