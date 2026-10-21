/* flop-fbk */
/* Ударный режим: дневная цель и серия дней. Хранится только в браузере (localStorage). */
(function(){
  var KEY='flop_days', GKEY='flop_goal';
  function today(d){ d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
  function save(D){ try{ localStorage.setItem(KEY,JSON.stringify(D)); }catch(e){} }
  function goal(){ var g=20; try{ g=+localStorage.getItem(GKEY)||20; }catch(e){} return g; }
  function total(o){ return o?(o.h||0)+(o.o||0)+(o.p||0):0; }
  function shift(s,n){ var p=s.split('-'); var d=new Date(+p[0],+p[1]-1,+p[2]); d.setDate(d.getDate()+n); return today(d); }
  function info(){
    var D=load(), g=goal(), t=today(), done=function(k){ return total(D[k])>=g; };
    var cur=0, k=done(t)?t:shift(t,-1); while(done(k)){ cur++; k=shift(k,-1); }
    var best=0, run=0, keys=Object.keys(D).sort(); var prev=null;
    keys.forEach(function(k){ if(total(D[k])>=g){ run=(prev&&shift(prev,1)===k)?run+1:1; prev=k; if(run>best) best=run; } });
    var days=keys.filter(function(k){ return total(D[k])>=g; }).length;
    return {streak:cur,best:Math.max(best,cur),today:total(D[t]),goal:g,doneToday:done(t),days:days,data:D};
  }
  function toast(t){ var el=document.createElement('div'); el.className='flop-toast'; el.setAttribute('role','status'); el.textContent=t; document.body.appendChild(el); setTimeout(function(){ el.remove(); },3200); }
  var FLAME='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 3.2-1 5-2.6 6.8C8 10.4 6.5 12 6.5 14.8A5.5 5.5 0 0 0 12 20.3a5.5 5.5 0 0 0 5.5-5.5c0-2.3-1-4.1-2.2-5.4-.2 1.4-.9 2.5-2 3 .5-3.3-.1-7.2-1.3-10.4z"/></svg>';
  function badge(){
    var nav=document.querySelector('.sitenav'); if(!nav) return; var i=info();
    var a=nav.querySelector('.streak'); if(!a){ a=document.createElement('a'); a.className='streak'; a.href='stats.html#streak'; nav.appendChild(a); }
    if(!nav.querySelector('.fbk')){ var f=document.createElement('a'); f.className='fbk'; f.href='https://t.me/ilya21314'; f.target='_blank'; f.rel='noopener'; f.textContent='Отзыв'; f.title='Написать автору в Telegram'; f.addEventListener('click',function(){ mgoal('feedback'); }); nav.insertBefore(f,a); }
    a.classList.toggle('done',i.doneToday);
    a.title=i.doneToday?'Цель дня выполнена. Серия: '+i.streak:'Сегодня '+i.today+' из '+i.goal+'. Серия: '+i.streak;
    a.setAttribute('aria-label',a.title);
    a.innerHTML=FLAME+'<span>'+i.streak+'</span><span class="goal">'+(i.doneToday?'✓':Math.min(i.today,i.goal)+'/'+i.goal)+'</span>';
  }
  function track(kind,n){
    var D=load(), t=today(), o=D[t]||(D[t]={}); var before=total(o)>=goal();
    o[kind]=(o[kind]||0)+(n||1); save(D);
    try{ var sk='flop_s_'+kind, c=(+sessionStorage.getItem(sk)||0)+1; sessionStorage.setItem(sk,c); var nm={h:'hand',o:'outs',p:'pushfold'}[kind]; if(c===1||c===10||c===50) mgoal(nm+'_'+c); }catch(e){}
    if(!before&&total(o)>=goal()){ var s=info().streak; mgoal('daily_goal',{streak:s}); toast('Цель дня выполнена! Серия: '+s+' '+plural(s,['день','дня','дней'])+' подряд'); }
    badge();
  }
  function plural(n,f){ n=Math.abs(n)%100; var n1=n%10; if(n>10&&n<20) return f[2]; if(n1>1&&n1<5) return f[1]; if(n1===1) return f[0]; return f[2]; }
  function mgoal(n,p){ try{ if(window.ym) ym(113725607,'reachGoal',n,p||{}); }catch(e){} }
  window.Flop={ev:mgoal,track:track,info:info,goal:goal,setGoal:function(g){ try{ localStorage.setItem(GKEY,String(g)); }catch(e){} badge(); },today:today,shift:shift,total:total,plural:plural,badge:badge};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',badge); else badge();
})();

/* Общий скрипт сайта: Яндекс Метрика и уведомление о cookies.
   Пока METRIKA_ID пустой, ничего не загружается и баннер не показывается.
   Чтобы включить: создай счётчик на metrika.yandex.ru и впиши его номер ниже. */
(function(){
  var METRIKA_ID = '113725607';
  if(!METRIKA_ID) return;
  (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
   k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
   (window,document,'script','https://mc.yandex.ru/metrika/tag.js?id='+METRIKA_ID,'ym');
  ym(Number(METRIKA_ID),'init',{ssr:true,webvisor:true,clickmap:true,referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
  var ok=false; try{ ok=localStorage.getItem('cookie_ok')==='1'; }catch(e){}
  if(ok) return;
  var b=document.createElement('div');
  b.setAttribute('role','region'); b.setAttribute('aria-label','Уведомление о cookies');
  b.style.cssText='position:relative;margin:4px 0 10px;z-index:1;background:#141a17;color:#eef1ef;border-radius:12px;padding:9px 12px;font:13px/1.4 Onest,system-ui,sans-serif;display:flex;gap:10px;flex-wrap:nowrap;align-items:center;flex-wrap:wrap;';
  b.innerHTML='<span style="flex:1 1 auto">Сайт использует cookies и Яндекс Метрику, чтобы становиться удобнее. Личные данные не собираются. <a href="privacy.html" style="color:#9fd8bc">Подробнее</a></span><button type="button" style="min-height:34px;padding:0 14px;border-radius:9px;flex:0 0 auto;border:0;background:#47b383;color:#06140d;font:600 14px Onest,system-ui,sans-serif;cursor:pointer">Понятно</button>';
  b.querySelector('button').onclick=function(){ try{ localStorage.setItem('cookie_ok','1'); }catch(e){} b.remove(); };
  function place(){ if(b.isConnected) return; var nav=document.querySelector('.sitenav')||document.querySelector('.topbar');
    if(nav&&nav.classList.contains('topbar')){ b.style.margin='8px auto'; b.style.maxWidth='1088px'; b.style.width='calc(100% - 32px)'; nav.after(b); }
    else if(nav) nav.after(b); else { b.style.cssText+=';position:fixed;left:12px;right:12px;bottom:12px;max-width:560px;margin:0 auto;z-index:15'; document.body.appendChild(b); } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',place); else place();
})();

/* Установка как приложение и офлайн-режим */
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }
