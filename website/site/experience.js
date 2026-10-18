'use strict';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const root=document.documentElement;
function updateThemeImages(){const theme=root.dataset.theme==='dark'?'dark':'light';document.querySelectorAll('img[data-theme-light][data-theme-dark]').forEach(img=>{const next=theme==='dark'?img.dataset.themeDark:img.dataset.themeLight;if(img.getAttribute('src')!==next)img.src=next;});}
function updateThemeControls(){updateThemeImages();const light=root.dataset.theme==='light';document.querySelectorAll('.theme-toggle').forEach(b=>{b.setAttribute('aria-label',`Switch to ${light?'dark':'light'} theme`);b.setAttribute('aria-pressed',String(light));b.querySelector('.theme-label').textContent=light?'Dark':'Light';});document.querySelector('meta[name="theme-color"]')?.setAttribute('content',light?'#f6f3ec':'#191917');}
updateThemeControls();
document.querySelectorAll('.theme-toggle').forEach(b=>b.addEventListener('click',()=>{const theme=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=theme;try{localStorage.setItem('im-theme',theme);const domain=location.hostname==='intellimatrix.in'||location.hostname.endsWith('.intellimatrix.in')?'; Domain=intellimatrix.in':'';document.cookie=`im-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${location.protocol==='https:'?'; Secure':''}`;}catch{}updateThemeControls();window.dispatchEvent(new Event('themechange'));}));
window.addEventListener('storage',e=>{if(e.key==='im-theme'&&['light','dark'].includes(e.newValue)){root.dataset.theme=e.newValue;updateThemeControls();window.dispatchEvent(new Event('themechange'));}});
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('#navigation');
function closeMenu(){if(!menu||!nav)return;nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');}
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.classList.toggle('open',open);});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav?.classList.contains('open')){closeMenu();menu.focus();}});
const reveals=document.querySelectorAll('.reveal');
if(!reducedMotion.matches&&'IntersectionObserver'in window){root.classList.add('motion-ready');const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{threshold:.05});reveals.forEach(el=>observer.observe(el));}else reveals.forEach(el=>el.classList.add('is-visible'));
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){root.classList.remove('motion-ready');reveals.forEach(el=>el.classList.add('is-visible'));}});
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
let toastTimer;
function toast(message){const box=document.querySelector('.toast');if(!box)return;box.textContent=message;box.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('visible'),3200);}
function setupTabs(buttons,activate){const list=[...buttons];list.forEach((button,index)=>{button.addEventListener('click',()=>activate(button));button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%list.length;else if(event.key==='ArrowLeft')next=(index-1+list.length)%list.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=list.length-1;else return;event.preventDefault();list[next].focus();activate(list[next]);});});return button=>list.forEach(b=>{b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;});}
