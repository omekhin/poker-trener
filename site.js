/* ===== Общая шапка сайта: одна на всех страницах. На телефоне снизу таб-бар. ===== */
(function(){
  var P=(location.pathname.split('/').pop()||'index.html').toLowerCase(); if(P==='') P='index.html';
  var GROUP={'play.html':'play','pushfold.html':'pf','learn.html':'learn','guide.html':'learn','calc.html':'learn','outs.html':'learn','stats.html':'stats','rating.html':'stats'};
  var g=GROUP[P]||'';
  var I={
    play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="7"/><path d="M8 12h8"/></svg>',
    pf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    learn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'};
  var LOGO='<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="2" width="26" height="28" rx="5" fill="var(--accent)"/><path d="M16 7c-3 4-8 6.5-8 10.3 0 2.3 1.8 3.9 3.9 3.9 1.3 0 2.4-.6 3.1-1.5-.3 2-1 3.6-2.3 4.8h6.6c-1.3-1.2-2-2.8-2.3-4.8.7.9 1.8 1.5 3.1 1.5 2.1 0 3.9-1.6 3.9-3.9C24 13.5 19 11 16 7z" fill="var(--accent-ink)"/></svg>';
  var ITEMS=[['play','play.html','Играть'],['pf','pushfold.html','Пуш/фолд'],['learn','learn.html','Учиться'],['stats','stats.html','Статистика']];
  var SUB={learn:[['learn.html','С нуля'],['guide.html','Шпаргалка'],['calc.html','Калькулятор шансов'],['outs.html','Тренажёр аутов']],stats:[['stats.html','Моя статистика'],['rating.html','Рейтинг']]};
  function link(it,cls){ return '<a href="'+it[1]+'"'+(cls?' class="'+cls+'"':'')+(g===it[0]?' aria-current="page"':'')+'>'+I[it[0]]+'<span>'+it[2]+'</span></a>'; }
  var old=document.querySelectorAll('.sitenav, header.topbar'); for(var i=0;i<old.length;i++) old[i].remove();
  var h=document.createElement('header'); h.className='sitebar'+(P==='play.html'?' is-play':'');
  h.innerHTML='<nav class="sitenav" aria-label="Разделы"><a class="brand" href="./">'+LOGO+'<span>Флоп</span></a><span class="links">'+ITEMS.map(function(it){ return link(it); }).join('')+'</span><span class="sp"></span></nav>'
    +(SUB[g]?'<nav class="subnav" aria-label="Подразделы">'+SUB[g].map(function(it){ return '<a href="'+it[0]+'"'+(P===it[0]?' aria-current="page"':'')+'>'+it[1]+'</a>'; }).join('')+'</nav>':'');
  document.body.insertBefore(h,document.body.firstChild);
  var setH=function(){ document.documentElement.style.setProperty('--hdr',h.offsetHeight+'px'); }; setH(); window.addEventListener('resize',setH); if(document.fonts) document.fonts.ready.then(setH);
  if(P!=='play.html'){ var t=document.createElement('nav'); t.className='tabbar'; t.setAttribute('aria-label','Разделы'); t.innerHTML=ITEMS.map(function(it){ return link(it); }).join(''); document.body.appendChild(t); document.documentElement.classList.add('has-tabbar'); }
})();

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
  var b=document.createElement('div'); b.className='cookie-toast'; b.setAttribute('role','region'); b.setAttribute('aria-label','Уведомление о cookies');
  b.innerHTML='<span>Сайт использует cookies и Яндекс Метрику. <a href="privacy.html">Подробнее</a></span><button type="button">Ок</button>';
  b.querySelector('button').onclick=function(){ try{ localStorage.setItem('cookie_ok','1'); }catch(e){} b.remove(); };
  function place(){ if(!b.isConnected) document.body.appendChild(b); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',place); else place();
})();

/* Установка как приложение и офлайн-режим */
(function(){
  var deferred=null; window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferred=e; document.documentElement.classList.add('can-install'); });
  var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone;
  var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  window.Flop=window.Flop||{};
  Flop.installState=function(){ return standalone?'installed':deferred?'prompt':ios?'ios':'manual'; };
  Flop.install=function(){
    if(window.Flop.ev) Flop.ev('install_click');
    if(deferred){ deferred.prompt(); deferred.userChoice.then(function(c){ if(c&&c.outcome==='accepted'&&Flop.ev) Flop.ev('install_ok'); deferred=null; }); return; }
    var ov=document.createElement('div'); ov.className='fa-ov'; ov.innerHTML='<div class="fa-box" role="dialog" aria-modal="true"><button type="button" class="fa-x" aria-label="Закрыть">×</button><h3>Флоп на телефоне</h3>'+(ios?'<p>В Safari нажми <b>«Поделиться»</b> (квадрат со стрелкой внизу экрана) → <b>«На экран Домой»</b>. Иконка Флопа появится рядом с приложениями и откроется без адресной строки.</p>':'<p>Открой меню браузера (⋮ справа вверху) → <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</p>')+'<p class="fa-sm">Работает и без интернета: стол, пуш/фолд и шпаргалка сохраняются на телефоне.</p></div>';
    ov.addEventListener('click',function(e){ if(e.target===ov||e.target.classList.contains('fa-x')) ov.remove(); }); document.body.appendChild(ov);
  };
})();
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }
/* вход и синхронизация прогресса */
(function(){ ['share.js?v=17','auth.js?v=17'].forEach(function(f){ var s=document.createElement('script'); s.src=f; s.defer=true; document.head.appendChild(s); }); })();
