(() => {
  document.documentElement.classList.add('js');
  let theme;
  try { theme = localStorage.getItem('amit-theme'); } catch {}
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
