'use strict';
(() => {
  if (!document.body.classList.contains('scroll-home')) return;
  const root=document.documentElement;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const desktop=matchMedia('(min-width: 1001px)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const header=document.querySelector('.header');
  const progress=document.querySelector('.page-progress > span');
  const topButton=document.querySelector('.back-top');
  const motionButton=document.querySelector('.motion-setting');
  const chapters=[...document.querySelectorAll('.story-chapter')];
  const counter=document.querySelector('.story-counter');
  const links=[...document.querySelectorAll('[data-section-link]')];
  const artworks=[...document.querySelectorAll('[data-art]')];
  const media=[...document.querySelectorAll('[data-media-reveal]')];
  const readings=[...document.querySelectorAll('[data-reading]')];
  const wordmarks=[...document.querySelectorAll('[data-marquee]')];
  const story=document.querySelector('.story-layout');
  const storyTrack=document.querySelector('.story-section-track span');
  const finite=new Set();
  const entered=new WeakSet();
  const visibleArts=new WeakSet();
  const ambient=new Map();
  let enabled=!preference.matches,lastScene=null,pending=false,documentHeight=1,destroyed=false;
  const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
  function animate(el,frames,options={}){
    if(!enabled||!el?.animate)return;
    const animation=el.animate(frames,{duration:900,easing:'cubic-bezier(.16,1,.3,1)',fill:'none',...options});
    finite.add(animation);animation.finished.then(()=>finite.delete(animation),()=>finite.delete(animation));return animation;
  }
  for(const section of readings){
    const paragraph=section.querySelector('.reading-copy');
    const words=paragraph.textContent.trim().split(/\s+/);
    paragraph.replaceChildren(...words.flatMap((word,index)=>{
      const span=document.createElement('span');span.className='read-word';span.textContent=word;
      return index?[document.createTextNode(' '),span]:[span];
    }));
  }
  function measure(){documentHeight=Math.max(1,root.scrollHeight-innerHeight);}
  function schedule(){if(pending||destroyed)return;pending=true;requestAnimationFrame(render);}
  function syncAmbient(){
    artworks.forEach(art=>{
      const current=ambient.get(art);
      const shouldPlay=enabled&&visibleArts.has(art)&&!document.hidden;
      if(!shouldPlay){current?.pause();return;}
      if(current){current.play();return;}
      const el=art.querySelector('.art-parallax');
      const animation=el.animate([{transform:'translateY(0)'},{transform:'translateY(-11px)'},{transform:'translateY(0)'}],{duration:7600,iterations:Infinity,easing:'ease-in-out'});
      ambient.set(art,animation);
    });
  }
  function replayArt(art){
    if(!enabled)return;
    animate(art.querySelector('.sketch-image'),[{clipPath:'inset(0 0 100% 0)',opacity:.3},{clipPath:'inset(0 0 0% 0)',opacity:1}],{duration:1400});
    art.querySelectorAll('.orbit-line').forEach((line,index)=>animate(line,[{strokeDashoffset:1},{strokeDashoffset:line.style.strokeDashoffset||0}],{duration:1600,delay:index*120}));
  }
  function applyMotion(){
    root.dataset.motion=enabled?'on':'off';
    if(motionButton){motionButton.setAttribute('aria-pressed',String(!enabled));motionButton.setAttribute('aria-label',enabled?'Pause page animations':'Enable page animations');motionButton.querySelector('[data-motion-label]').textContent=enabled?'Motion on':'Motion off';}
    document.querySelectorAll('.art-replay').forEach(button=>button.disabled=!enabled);
    if(!enabled){
      finite.forEach(animation=>animation.cancel());finite.clear();
      ambient.forEach(animation=>animation.cancel());ambient.clear();
      artworks.forEach(art=>{art.querySelector('.art-pointer').style.removeProperty('transform');art.querySelector('.art-plane').style.removeProperty('transform');});
      media.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('clip-path');});
      document.querySelector('.story-media .screenshot-frame')?.style.removeProperty('transform');
      chapters.forEach(chapter=>chapter.classList.remove('is-active'));
    }
    lastScene=null;syncAmbient();requestAnimationFrame(()=>{measure();schedule();});
  }
  motionButton?.addEventListener('click',()=>{enabled=!enabled;applyMotion();});
  preference.addEventListener('change',()=>{enabled=!preference.matches;applyMotion();});
  const targets=[...document.querySelectorAll('.hero-meta,.hero-description,.hero-actions,.hero-command,.hero-location,.atlas-hero-foot,.section-head,.section-label,.project-description,.q3-copy,.founder-section,.atlas-contact,.guide-card,.install-console,.product-support')];
  if('IntersectionObserver'in window){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting||entered.has(entry.target))return;
        entered.add(entry.target);observer.unobserve(entry.target);
        animate(entry.target,[{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'translateY(0)'}],{duration:900});
      });
    },{threshold:.08});targets.forEach(el=>observer.observe(el));
    const artObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){visibleArts.add(entry.target);if(!entered.has(entry.target)){entered.add(entry.target);replayArt(entry.target);}}else visibleArts.delete(entry.target);});syncAmbient();
    },{threshold:.02});artworks.forEach(art=>artObserver.observe(art));
  }
  artworks.forEach(art=>{
    art.querySelector('.art-replay')?.addEventListener('click',()=>replayArt(art));
    const plane=art.querySelector('.art-plane'),pointer=art.querySelector('.art-pointer');
    let rect;
    plane.addEventListener('pointerenter',()=>{rect=plane.getBoundingClientRect();});
    plane.addEventListener('pointermove',event=>{
      if(!enabled||!desktop.matches||!finePointer.matches||!rect)return;
      const x=clamp((event.clientX-rect.left)/rect.width,-.2,1.2)-.5;
      const y=clamp((event.clientY-rect.top)/rect.height,-.2,1.2)-.5;
      pointer.style.transform=`rotateX(${-y*6}deg) rotateY(${x*7}deg) translate(${x*7}px,${y*5}px)`;
    });
    plane.addEventListener('pointerleave',()=>{pointer.style.removeProperty('transform');});
  });
  const sceneNumbers={start:'01',explore:'02',terminal:'03'};
  document.querySelectorAll('[data-preview]').forEach(tab=>tab.addEventListener('click',()=>{
    if(counter){counter.textContent=`${sceneNumbers[tab.dataset.preview]} / 03`;animate(counter,[{opacity:.2,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:450});}
    animate(document.querySelector('#preview-image'),[{opacity:.3},{opacity:1}],{duration:400});
  }));
  function render(){
    pending=false;
    const y=scrollY,h=innerHeight,headerHeight=header?.offsetHeight||90;
    if(progress)progress.style.transform=`scaleX(${clamp(y/documentHeight)})`;
    header?.classList.toggle('is-scrolled',y>20);
    if(topButton)topButton.hidden=y<h;
    let activeLink=null;
    for(const link of links){const target=document.getElementById(new URL(link.href).hash.slice(1));if(target&&target.getBoundingClientRect().top<=h*.4)activeLink=link;}
    links.forEach(link=>{if(link===activeLink)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    readings.forEach(section=>{
      const r=section.getBoundingClientRect(),p=enabled?clamp((headerHeight-r.top)/Math.max(1,r.height-h+headerHeight)):1;
      const words=section.querySelectorAll('.read-word');words.forEach((word,index)=>word.classList.toggle('is-read',index<Math.ceil(p*words.length)));
      const path=section.querySelector('.manifesto-loop path');if(path)path.style.strokeDashoffset=String(1-p);
    });
    if(storyTrack&&story){const r=story.getBoundingClientRect();storyTrack.style.transform=`scaleY(${clamp((h*.4-r.top)/Math.max(1,r.height-h*.5))})`;}
    if(enabled&&desktop.matches&&chapters.length){
      let active=chapters[0];for(const chapter of chapters){if(chapter.getBoundingClientRect().top<=h*.48)active=chapter;}
      if(active.dataset.scene!==lastScene){lastScene=active.dataset.scene;chapters.forEach(chapter=>chapter.classList.toggle('is-active',chapter===active));const tab=document.querySelector(`[data-preview="${lastScene}"]`);if(tab&&tab.getAttribute('aria-selected')!=='true')tab.click();}
      const r=active.getBoundingClientRect(),p=clamp((h*.5-r.top)/r.height);
      const frame=document.querySelector('.story-media .screenshot-frame');if(frame)frame.style.transform=`perspective(1400px) rotateY(${(.5-p)*1.6}deg) translateY(${(.5-p)*10}px)`;
    }
    if(enabled){
      artworks.forEach(art=>{
        const rect=art.getBoundingClientRect();if(rect.bottom<0||rect.top>h)return;
        const p=clamp((h-rect.top)/(h+rect.height));
        if(desktop.matches)art.querySelector('.art-plane').style.transform=`translateY(${(p-.4)*-46}px)`;
        art.querySelectorAll('.orbit-line').forEach(line=>line.style.strokeDashoffset=String(1-clamp(.2+p*.95)));
      });
      media.forEach(el=>{
        const rect=el.getBoundingClientRect();if(rect.bottom<0||rect.top>h)return;
        const p=clamp((h*.95-rect.top)/(h*.8));
        el.style.transform=desktop.matches?`translateY(${(1-p)*24}px) scale(${.94+p*.06})`:'none';
        el.style.clipPath=`inset(0 ${(1-p)*(desktop.matches?3:0)}% round ${desktop.matches?8:5}px)`;
      });
      wordmarks.forEach(el=>{const r=el.getBoundingClientRect();if(r.bottom<0||r.top>h)return;const p=clamp((h-r.top)/(h+r.height));el.style.transform=desktop.matches?`translateX(${(1-p)*-24}px)`:'none';});
    }
  }
  topButton?.addEventListener('click',()=>{const main=document.querySelector('#main');if(main){main.setAttribute('tabindex','-1');main.focus({preventScroll:true});main.addEventListener('blur',()=>main.removeAttribute('tabindex'),{once:true});}scrollTo({top:0,behavior:enabled?'smooth':'instant'});});
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',()=>{measure();schedule();},{passive:true});
  desktop.addEventListener('change',()=>{lastScene=null;artworks.forEach(art=>art.querySelector('.art-plane').style.removeProperty('transform'));measure();schedule();});
  document.addEventListener('visibilitychange',syncAmbient);
  new ResizeObserver(()=>{measure();schedule();}).observe(document.body);
  document.fonts.ready.then(()=>{measure();schedule();});
  addEventListener('pagehide',()=>{destroyed=true;ambient.forEach(animation=>animation.pause());});
  addEventListener('pageshow',()=>{destroyed=false;measure();schedule();syncAmbient();});
  applyMotion();
  document.querySelectorAll('.title-ink').forEach((line,index)=>animate(line,[{transform:'translateY(110%) rotate(2deg)',opacity:.2},{transform:'translateY(0) rotate(0)',opacity:1}],{duration:1050,delay:120+index*110}));
})();
