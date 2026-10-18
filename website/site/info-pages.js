'use strict';
const themeReadout=document.querySelector('#current-theme');
function updateReadout(){if(themeReadout)themeReadout.textContent=document.documentElement.dataset.theme==='light'?'Light':'Dark';}
updateReadout();
window.addEventListener('themechange',updateReadout);
document.querySelector('#reset-theme')?.addEventListener('click',()=>{
  let cleared=true;
  try{
    localStorage.removeItem('im-theme');
    const cookie='im-theme=; Path=/; Max-Age=0; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
    document.cookie=cookie;
    if(location.hostname==='intellimatrix.in'||location.hostname.endsWith('.intellimatrix.in'))document.cookie=cookie+'; Domain=intellimatrix.in';
    cleared=!document.cookie.split('; ').some(v=>v.startsWith('im-theme='))&&!localStorage.getItem('im-theme');
  }catch{cleared=false;}
  document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  updateThemeControls();
  window.dispatchEvent(new Event('themechange'));
  document.querySelector('#preference-status').textContent=cleared?'Theme preference reset. This page now follows your device’s setting.':'The page now follows your device’s setting. Clear site data in your browser to finish removing any stored preference.';
});
document.querySelector('#copy-email')?.addEventListener('click',async()=>{
  const status=document.querySelector('#email-status');
  let copied=false;
  try{
    await navigator.clipboard.writeText('hello@theamit.me');
    copied=true;
  }catch{
    const address=document.querySelector('.contact-email>a');
    const range=document.createRange();range.selectNodeContents(address);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    try{copied=document.execCommand('copy');}catch{}
    if(copied)selection.removeAllRanges();
  }
  if(copied){
    status.textContent='Email address copied: hello@theamit.me';
    toast('Email address copied.');
  }else status.textContent='Email address selected. Press Ctrl+C or Command+C to copy hello@theamit.me.';
});
