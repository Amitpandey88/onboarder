'use strict';
(() => {
  const dialog = document.querySelector('#docs-search');
  const query = document.querySelector('#docs-query');
  const results = document.querySelector('#search-results');
  const state = document.querySelector('#search-state');
  let indexPromise, active = -1, openedBy;
  const loadIndex = () => indexPromise ||= fetch('/docs/search-index.json').then(response => {
    if (!response.ok) throw new Error('Documentation search unavailable');
    return response.json();
  }).catch(error => { indexPromise = null; throw error; });
  let generation = 0;
  async function search() {
    const current = ++generation;
    state.textContent = 'Loading guides…';
    try {
      const index = await loadIndex();
      if (generation !== current) return;
      const term = query.value.trim().toLowerCase();
      const words = term.split(/\s+/).filter(Boolean);
      const selected = words.length ? index.map(item => {
        const title = item.title.toLowerCase(), page = item.page.toLowerCase(), text = item.text.toLowerCase();
        const score = words.every(word => `${title} ${page} ${text}`.includes(word)) ? words.reduce((sum, word) => sum + (title.includes(word) ? 12 : 0) + (page.includes(word) ? 5 : 0) + (text.includes(word) ? 1 : 0), title === term ? 40 : 0) : 0;
        return {item, score};
      }).filter(value => value.score).sort((a,b) => b.score-a.score).slice(0,14).map(value => value.item) : index.filter(item => ['/docs/quickstart/','/docs/chat/','/docs/web/','/docs/commands/','/docs/self-hosting/','/docs/troubleshooting/'].includes(item.url));
      results.replaceChildren(); active = -1;
      for (const item of selected) {
        const link = document.createElement('a'); link.href = item.url; link.className = 'search-result'; link.setAttribute('role','listitem');
        const label = document.createElement('span'); label.className = 'search-result-path'; label.textContent = item.group + ' / ' + item.page;
        const title = document.createElement('strong'); title.textContent = item.title;
        const snippet = document.createElement('span'); snippet.className = 'search-result-snippet';
        let start = words.length ? Math.max(0, item.text.toLowerCase().indexOf(words[0]) - 45) : 0;
        snippet.textContent = (start ? '…' : '') + item.text.slice(start,start+145) + (item.text.length>start+145 ? '…' : '');
        link.append(label,title,snippet); link.addEventListener('click',()=>dialog.close()); results.append(link);
      }
      state.textContent = words.length ? (selected.length ? `${selected.length} result${selected.length===1?'':'s'}${selected.length===14?' shown':''}. Use arrow keys to choose.` : 'No results. Try a file action, command, or a shorter phrase.') : 'Popular guides · type to search all documentation';
    } catch { if (generation===current) { results.replaceChildren(); state.textContent = 'Search could not load. Browse the guide navigation or try again.'; } }
  }
  function openSearch(event) {
    if (!dialog) return;
    openedBy = event?.currentTarget || document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('modal-open'); query.value=''; query.focus(); search();
  }
  document.querySelectorAll('.search-toggle').forEach(button => button.addEventListener('click',openSearch));
  document.querySelector('#close-search')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('close',()=>{ document.body.classList.remove('modal-open'); if (openedBy?.isConnected) openedBy.focus(); });
  dialog?.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  let timer;
  query?.addEventListener('input',()=>{ clearTimeout(timer); timer=setTimeout(search,100); });
  dialog?.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();dialog.close();return;}
    const links=[...results.querySelectorAll('a')];
    if (event.key==='ArrowDown'||event.key==='ArrowUp') {
      if(!links.length)return;event.preventDefault();active=active<0?(event.key==='ArrowDown'?0:links.length-1):(active+(event.key==='ArrowDown'?1:-1)+links.length)%links.length;
      links.forEach((link,i)=>link.classList.toggle('active',i===active));links[active].focus();links[active].scrollIntoView({block:'nearest'});
    } else if(event.key==='Enter'&&document.activeElement===query&&links.length){event.preventDefault();links[Math.max(0,active)].click();}
    else if(event.key.length===1 && !event.metaKey && !event.ctrlKey && document.activeElement!==query){query.focus();}
  });
  document.addEventListener('keydown',event=>{
    const editable=event.target.closest('input,textarea,[contenteditable="true"]');
    if((event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey))||(event.key==='/'&&!editable)){
      event.preventDefault(); openSearch();
    }
  });
  document.querySelectorAll('kbd').forEach(el=>{if(el.textContent==='⌘ K'&&!/Mac|iPhone|iPad/.test(navigator.platform))el.textContent='Ctrl K';});
  const menu=document.querySelector('#docs-menu-toggle'), sidebar=document.querySelector('#docs-sidebar');
  const setMenu=open=>{sidebar?.classList.toggle('open',open);menu?.setAttribute('aria-expanded',String(open));if(menu)menu.textContent=open?'Close guides ↑':'Browse guides ↓';};
  menu?.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){setMenu(false);menu.focus();}});
  sidebar?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.querySelectorAll('.copy-code').forEach(button=>button.addEventListener('click',async()=>{
    const code=button.closest('.code-block').querySelector('code');
    try{await navigator.clipboard.writeText(code.textContent);button.textContent='Copied ✓';toast('Code copied to clipboard.');setTimeout(()=>button.textContent='Copy',1800);}
    catch{const range=document.createRange();range.selectNodeContents(code);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);toast('Code selected. Press Command-C or Ctrl-C to copy.');}
  }));
  const headings=[...document.querySelectorAll('.docs-content h2,.docs-content h3')];
  if(!document.body.classList.contains('docs-reader') && headings.length && 'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if(visible)document.querySelectorAll('.docs-toc a').forEach(a=>{if(a.hash==='#'+visible.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    },{rootMargin:'-90px 0px -65% 0px'});headings.forEach(h=>observer.observe(h));
  }
  const current=document.querySelector('.docs-sidebar [aria-current="page"]');
  if(current&&innerWidth>900)current.scrollIntoView({block:'nearest'});
  if(document.body.classList.contains('docs-page'))document.querySelector('.docs-nav-link')?.setAttribute('aria-current','page');
  if(location.hash){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(target)requestAnimationFrame(()=>target.scrollIntoView());}
})();
