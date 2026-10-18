import { escapeHtml } from './html.js';

/** In-page prompts also work in embedded browsers that suppress window.prompt. */
export function requestText(title: string, maximum = 4000): Promise<string | null> {
  const previous = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'review-patch-dialog';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = '<form method="dialog"><label>' + escapeHtml(title) + '<input class="text-input" name="answer" maxlength="' + maximum + '" required autocomplete="off"></label><p><button class="btn" type="submit">Save</button> <button class="btn" type="button" data-cancel>Cancel</button></p></form>';
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true; dialog.close(); dialog.remove();
      if (previous?.isConnected) previous.focus();
      resolve(value);
    };
    dialog.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); finish(dialog.querySelector<HTMLInputElement>('input')!.value.trim() || null); });
    dialog.querySelector('[data-cancel]')!.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    document.body.append(dialog); dialog.showModal(); dialog.querySelector<HTMLInputElement>('input')!.focus();
  });
}
