(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const themeLabel = document.querySelector('[data-theme-label]');
  const menuButton = document.querySelector('.menu-toggle');
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('#primary-nav');

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    if (persist) { try { localStorage.setItem('amit-theme', theme); } catch {} }
    if (themeButton && themeLabel) {
      const next = theme === 'dark' ? 'light' : 'dark';
      themeLabel.textContent = next === 'dark' ? 'Dark' : 'Light';
      themeButton.setAttribute('aria-label', `Switch to ${next} theme`);
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }
  applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
  themeButton?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));

  function setMenu(open) {
    if (!header || !menuButton) return;
    header.dataset.navOpen = String(open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  menuButton?.addEventListener('click', () => setMenu(header.dataset.navOpen !== 'true'));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
  document.addEventListener('click', event => {
    if (header?.dataset.navOpen !== 'true') return;
    if (!header.contains(event.target)) setMenu(false);
  });

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(element => observer.observe(element));
  } else {
    reveals.forEach(element => element.classList.add('is-visible'));
  }

  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = String(new Date().getFullYear()); });
})();
