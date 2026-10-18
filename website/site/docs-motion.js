'use strict';
(() => {
  if (!document.body.classList.contains('docs-reader')) return;
  const root=document.documentElement, main=document.querySelector('.docs-main');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const toggle=document.querySelector('.docs-motion-toggle');
  const bar=document.querySelector('.docs-reading-track span');
  const readouts=[...document.querySelectorAll('[data-docs-progress]')];
  const back=document.querySelector('.docs-back-top');
  const toc=document.querySelector('.docs-toc nav');
  const tocLinks=[...document.querySelectorAll('.docs-toc nav a,.docs-mobile-toc nav a')];
  const headings=[...document.querySelectorAll('.docs-content h2,.docs-content h3')];
  const animations=new Set(),seen=new WeakSet();
  let enabled=!reduced.matches,queued=false,stopped=false;
  let headerOffset=110,articleTop=0,articleBottom=1,headingPositions=[];
  try { if(localStorage.getItem('onboarder-docs-motion')==='off') enabled=false; } catch {}
  root.classList.add('docs-motion-ready');
  const marker=document.createElement('span');marker.className='docs-toc-marker';marker.setAttribute('aria-hidden','true');toc?.append(marker);
  function animate(el,frames,options={}) {
    if(!enabled||!el?.animate) return;
    const animation=el.animate(frames,{duration:550,easing:'cubic-bezier(.2,.8,.2,1)',...options});
    animations.add(animation);animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));
  }
  function applyMotion() {
    root.dataset.docsMotion=enabled?'on':'off';
    toggle?.setAttribute('aria-pressed',String(!enabled));
    toggle?.setAttribute('aria-label',enabled?'Pause documentation animations':'Enable documentation animations');
    if(toggle)toggle.textContent=enabled?'Motion on':'Motion off';
    if(!enabled){animations.forEach(a=>a.cancel());animations.clear();}
    schedule();
  }
  toggle?.addEventListener('click',()=>{
    enabled=!enabled;
    try{localStorage.setItem('onboarder-docs-motion',enabled?'on':'off');}catch{}
    applyMotion();
  });
  reduced.addEventListener('change',()=>{enabled=!reduced.matches;applyMotion();});
  function measure() {
    const content=document.querySelector('.docs-content');
    headerOffset=(document.querySelector('.header')?.offsetHeight||78)+(innerWidth<=900?64:34);
    articleTop=content.getBoundingClientRect().top+scrollY;
    articleBottom=content.getBoundingClientRect().bottom+scrollY;
    headingPositions=headings.map(el=>({el,top:el.getBoundingClientRect().top+scrollY}));
    schedule();
  }
  function render() {
    queued=false;
    const distance=Math.max(1,articleBottom-articleTop-innerHeight+headerOffset+80);
    const progress=Math.max(0,Math.min(1,(scrollY-articleTop+headerOffset)/distance));
    if(bar)bar.style.transform=`scaleX(${progress})`;
    readouts.forEach(el=>el.textContent=`${Math.round(progress*100)}%`);
    let current=headingPositions[0];
    for(const heading of headingPositions)if(heading.top<=scrollY+headerOffset+36)current=heading;
    // Match the nearest parent section represented in the compact TOC.
    let active=null;
    for(const heading of headingPositions){
      if(heading.top>(current?.top||0)+1)break;
      const match=tocLinks.find(a=>a.hash==='#'+heading.el.id);if(match)active=match;
    }
    tocLinks.forEach(link=>{if(active&&link.hash===active.hash)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    if(toc&&active){const link=[...toc.querySelectorAll('a')].find(a=>a.hash===active.hash);if(link){marker.style.transform=`translateY(${link.offsetTop}px)`;marker.style.height=`${link.offsetHeight}px`;}}
    if(back)back.hidden=scrollY<innerHeight;
  }
  function schedule(){if(queued||stopped)return;queued=true;requestAnimationFrame(render);}
  const blocks=[...document.querySelectorAll('.docs-content h2,.docs-content h3,.code-block,.table-wrap,.docs-callout,.docs-figure,.docs-start-cards>a,.docs-pagination>a')];
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting||seen.has(entry.target))return;
        seen.add(entry.target);observer.unobserve(entry.target);
        animate(entry.target,[{opacity:.35,transform:'translateY(13px)'},{opacity:1,transform:'translateY(0)'}]);
      });
    },{threshold:.08});blocks.forEach(el=>observer.observe(el));
  }
  back?.addEventListener('click',()=>{
    main.setAttribute('tabindex','-1');main.focus({preventScroll:true});main.addEventListener('blur',()=>main.removeAttribute('tabindex'),{once:true});
    scrollTo({top:0,behavior:enabled?'smooth':'instant'});
  });
  document.querySelectorAll('.docs-pagination a,.docs-start-cards>a').forEach(link=>link.addEventListener('pointerenter',()=>{
    // One restrained emphasis per pointer entry; no looping or cursor capture.
    animate(link.querySelector('h2>span'),[{transform:'translate(0,0)'},{transform:'translate(3px,-3px)'}],{duration:220});
  }));
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure,{passive:true});
  new ResizeObserver(measure).observe(main);
  document.fonts.ready.then(measure);addEventListener('load',measure,{once:true});
  addEventListener('pagehide',()=>{stopped=true;animations.forEach(a=>a.cancel());});
  addEventListener('pageshow',()=>{stopped=false;measure();});
  applyMotion();measure();
  if(!location.hash){
    [document.querySelector('.docs-breadcrumb'),document.querySelector('.docs-title'),document.querySelector('.docs-orientation')].forEach((el,i)=>animate(el,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,delay:i*70}));
    document.querySelectorAll('.doc-edge').forEach((path,i)=>animate(path,[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:1400,delay:200+i*140}));
  }
})();
