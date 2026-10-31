/* Флоп: вход через Telegram и синхронизация прогресса между устройствами.
   Работает, только когда задан API — адрес функции в Яндекс Облаке (см. auth-setup.md).
   Без входа всё по-прежнему хранится только в браузере. */
(function(){
'use strict';
var API='https://functions.yandexcloud.net/d4ec4fhnffjodos3c9ki';   // ← вставь сюда адрес функции, например 'https://functions.yandexcloud.net/d4e1abc...'
if(!API||!window.fetch) return;

var AK='flop_auth', LK='flop_sync_at';
var JSONK=['flop_stats','flop_hist','flop_days','pt_tours','pf_stats','ot_stats','pt_mtypes','learn_prog'];
var RAWK=['flop_goal','pt_newb','pt_hint','pt_speed','pt_table','pt_mode','pt_every','pf_mode'];
var SYNC=JSONK.concat(RAWK);

function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function auth(){ try{ return JSON.parse(get(AK)||'null'); }catch(e){ return null; } }
var applying=false, timer=null, busy=false, again=false;

/* --- track changes to synced keys --- */
var proto=Storage.prototype, oSet=proto.setItem, oDel=proto.removeItem;
proto.setItem=function(k,v){ oSet.apply(this,arguments); if(this===window.localStorage&&!applying&&SYNC.indexOf(k)>=0) schedule(); };
proto.removeItem=function(k){ oDel.apply(this,arguments); if(this===window.localStorage&&!applying&&SYNC.indexOf(k)>=0) schedule(); };
function put(k,v){ applying=true; try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} applying=false; }
function schedule(){ if(!auth()) return; clearTimeout(timer); timer=setTimeout(function(){ sync(); },5000); }

/* --- merging: nothing is lost when two devices both played --- */
function uniq(arr,key){ var seen={}, out=[]; arr.forEach(function(x){ var k=key?key(x):x; if(!seen[k]){ seen[k]=1; out.push(x); } }); return out; }
function maxMerge(a,b){
  if(typeof a==='number'&&typeof b==='number') return Math.max(a,b);
  if(Array.isArray(a)&&Array.isArray(b)) return a.length>=b.length?a:b;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){ var o={}; Object.keys(b).forEach(function(k){ o[k]=b[k]; }); Object.keys(a).forEach(function(k){ o[k]=(k in b)?maxMerge(a[k],b[k]):a[k]; }); return o; }
  return a!=null?a:b;
}
function mergeStats(a,b){
  if(!a||a.v!==1) return b; if(!b||b.v!==1) return a;
  var hands=uniq((b.hands||[]).concat(a.hands||[]),function(h){ return h.t+'|'+h.s; }).sort(function(x,y){ return x.t-y.t; }).slice(-6000);
  var ss={}; (b.sessions||[]).concat(a.sessions||[]).forEach(function(s){ var o=ss[s.id]; if(!o||(s.hands||0)>(o.hands||0)) ss[s.id]=s; });
  var sessions=Object.keys(ss).map(function(k){ return ss[k]; }).sort(function(x,y){ return (y.start||0)-(x.start||0); }).slice(0,300);
  var mistakes=uniq((a.mistakes||[]).concat(b.mistakes||[]),function(m){ return m.t+'|'+m.x; }).sort(function(x,y){ return y.t-x.t; }).slice(0,200);
  return {v:1,hands:hands,sessions:sessions,mistakes:mistakes};
}
function mergeOne(k,l,r){
  if(r==null) return l; if(l==null) return r;
  if(RAWK.indexOf(k)>=0) return l;
  var a,b; try{ a=JSON.parse(l); b=JSON.parse(r); }catch(e){ return l; }
  var m;
  switch(k){
    case 'flop_stats': m=mergeStats(a,b); break;
    case 'flop_hist': m=uniq((b||[]).concat(a||[])).slice(-300); break;
    case 'pt_tours': m=uniq((a||[]).concat(b||[]),JSON.stringify).sort(function(x,y){ return x.date<y.date?1:-1; }).slice(0,30); break;
    case 'learn_prog': m=Object.assign({},b,a); break;
    default: m=maxMerge(a,b);
  }
  return JSON.stringify(m);
}

/* --- server calls --- */
function api(a,opt){
  opt=opt||{}; var au=auth(), h={};
  if(au&&au.token) h.Authorization='Bearer '+au.token;
  if(opt.body) h['Content-Type']='text/plain';
  return fetch(API+(API.indexOf('?')>=0?'&':'?')+'a='+a+(opt.q||''),{method:opt.body?'POST':'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined,keepalive:!!opt.keepalive})
    .then(function(r){ if(r.status===401&&au&&au.token){ logout(true); throw new Error('unauthorized'); } if(!r.ok) throw new Error('http '+r.status); return r.json(); });
}

var firstSync=true;
function sync(o){
  o=o||{}; if(!auth()) return Promise.resolve();
  if(busy){ again=true; return Promise.resolve(); }
  busy=true; setState('sync');
  return (o.force?Promise.resolve({data:{}}):api('load')).then(function(rec){
    var remote=(rec&&rec.data)||{}, merged={}, changed=false;
    SYNC.forEach(function(k){
      var l=get(k), m=o.force?l:mergeOne(k,l,remote[k]);
      if(m!=null) merged[k]=m;
      if(m!==l){ put(k,m); changed=true; }
    });
    var same=SYNC.every(function(k){ return merged[k]===remote[k]; });
    return (same&&!o.force?Promise.resolve():api('save',{body:{data:merged}})).then(function(){ return changed; });
  }).then(function(changed){
    try{ localStorage.setItem(LK,String(Date.now())); }catch(e){}
    setState('ok');
    if(window.Flop&&Flop.badge) Flop.badge();
    if(changed&&firstSync&&!/play\.html/.test(location.pathname)){
      var rk='flop_sync_reload'; try{ if(!sessionStorage.getItem(rk)){ sessionStorage.setItem(rk,'1'); location.reload(); } }catch(e){}
    }
    firstSync=false;
  }).catch(function(e){ setState('err'); console.warn('sync',e); })
  .then(function(){ busy=false; if(again){ again=false; schedule(); } });
}

/* --- login with a Telegram bot deep link: works even where telegram.org scripts are slow --- */
var pollT=null;
function login(){
  var box=modal('<h3>Сохраняй прогресс</h3><p>Войди через Telegram — статистика, серия дней, ошибки и уроки сохранятся в аккаунте. Их будет видно и с телефона, и с компьютера.</p><p class="fa-st" id="faSt">Готовлю ссылку…</p>');
  api('start').then(function(r){
    var st=box.querySelector('#faSt');
    st.innerHTML='<a class="fa-btn" id="faGo" href="'+r.link+'" target="_blank" rel="noopener">Открыть Telegram</a><span class="fa-sm">Нажми «Запустить» (Start) в боте @'+r.bot+' и вернись на эту вкладку. Мы получим только имя и номер аккаунта Telegram — без телефона и переписки. Входя, ты соглашаешься с <a href="privacy.html" target="_blank">политикой конфиденциальности</a>.</span><span class="fa-w" id="faW" hidden>Жду подтверждения из Telegram…</span>';
    box.querySelector('#faGo').addEventListener('click',function(){ box.querySelector('#faW').hidden=false; });
    var t0=Date.now();
    clearInterval(pollT);
    pollT=setInterval(function(){
      if(document.hidden) return;
      if(Date.now()-t0>10*60*1000){ clearInterval(pollT); st.innerHTML='<span class="fa-w">Ссылка устарела. Закрой окно и нажми «Войти» ещё раз.</span>'; return; }
      api('poll',{q:'&code='+encodeURIComponent(r.code)}).then(function(p){
        if(p.token){ clearInterval(pollT); try{ localStorage.setItem(AK,JSON.stringify({token:p.token,name:p.name,username:p.username})); }catch(e){}
          closeModal(); nav(); toast('Вход выполнен: '+p.name+'. Прогресс сохраняется в аккаунте'); if(window.Flop&&Flop.ev) Flop.ev('login');
          firstSync=true; sync().then(function(){ return api('me'); }).then(function(m){ saveNick(m&&m.nick); if(!(m&&m.nick)) setTimeout(nickPrompt,600); }).catch(function(){}); }
        else if(p.expired){ clearInterval(pollT); st.innerHTML='<span class="fa-w">Ссылка устарела. Закрой окно и нажми «Войти» ещё раз.</span>'; }
      }).catch(function(){});
    },2000);
  }).catch(function(){ box.querySelector('#faSt').textContent='Сервер входа не отвечает. Попробуй позже — пока всё сохраняется в этом браузере.'; });
}
/* --- nickname for the leaderboard: Telegram name is never shown --- */
function saveNick(n){ var a=auth(); if(!a) return; a.nick=n||null; try{ localStorage.setItem(AK,JSON.stringify(a)); }catch(e){} nav(); }
function nickPrompt(then){
  var a=auth(); if(!a) return login();
  var box=modal('<h3>Ник для рейтинга</h3><p>В рейтинге видно только ник — имя и Telegram никто не увидит.</p><input class="fa-in" id="faNick" maxlength="16" placeholder="Например, RiverKing" value="'+esc(a.nick||'')+'"><p class="fa-sm" id="faNe">3–16 символов: буквы, цифры, пробел, _ и -</p><div class="fa-row"><button type="button" class="fa-btn" id="faNs">Сохранить</button><button type="button" class="fa-sec" id="faNl">Позже</button></div>');
  var inp=box.querySelector('#faNick'), er=box.querySelector('#faNe'); inp.focus();
  box.querySelector('#faNl').onclick=closeModal;
  function go(){ var n=inp.value.trim(); if(!/^[A-Za-zА-Яа-яЁё0-9_\- ]{3,16}$/.test(n)){ er.textContent='3–16 символов: буквы, цифры, пробел, _ и -'; er.style.color='#d9480f'; return; }
    api('nick',{body:{nick:n}}).then(function(r){ saveNick(r.nick); closeModal(); toast('Ник сохранён: '+r.nick); if(window.Flop&&Flop.ev) Flop.ev('nick_set'); if(typeof then==='function') then(); })
      .catch(function(e){ er.style.color='#d9480f'; er.textContent=/409/.test(String(e))?'Этот ник уже занят — придумай другой':'Не получилось сохранить, попробуй ещё раз'; }); }
  box.querySelector('#faNs').onclick=go; inp.addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
}
function account(){
  var a=auth(), last=+get(LK)||0;
  var box=modal('<h3>'+esc(a.nick||a.name)+'</h3><p class="fa-sm">Ник в рейтинге: <b>'+(a.nick?esc(a.nick):'не выбран')+'</b> · <button type="button" class="fa-link" id="faNk" style="display:inline">'+(a.nick?'сменить':'придумать')+'</button></p><p>'+(a.username?'Telegram @'+esc(a.username)+'. ':'')+'Прогресс сохраняется в аккаунте и подтягивается на любом устройстве, где ты вошёл.</p><p class="fa-sm">Раз в день бот напоминает про серию, если цель дня не выполнена. Выключить — напиши боту /stop.</p><p class="fa-sm" id="faLast">'+(last?'Последняя синхронизация: '+new Date(last).toLocaleString('ru-RU'):'Ещё не синхронизировалось')+'</p><div class="fa-row"><button type="button" class="fa-btn" id="faSync">Синхронизировать</button><button type="button" class="fa-sec" id="faOut">Выйти</button></div><button type="button" class="fa-link" id="faDel">Удалить мои данные с сервера</button>');
  box.querySelector('#faNk').onclick=function(){ nickPrompt(); };
  box.querySelector('#faSync').onclick=function(){ sync().then(function(){ var l=+get(LK)||0; box.querySelector('#faLast').textContent='Последняя синхронизация: '+new Date(l).toLocaleString('ru-RU'); }); };
  box.querySelector('#faOut').onclick=function(){ logout(); closeModal(); toast('Ты вышел. Статистика осталась в этом браузере'); };
  box.querySelector('#faDel').onclick=function(){ if(!confirm('Удалить прогресс с сервера и выйти? В этом браузере данные останутся.')) return; api('delete',{body:{}}).then(function(){ logout(); closeModal(); toast('Данные на сервере удалены'); }).catch(function(){ toast('Не получилось — попробуй позже'); }); };
}
function logout(silent){ try{ localStorage.removeItem(AK); localStorage.removeItem(LK); }catch(e){} nav(); if(silent) toast('Вход устарел — войди ещё раз, чтобы синхронизировать прогресс'); }

/* --- UI --- */
function esc(s){ return String(s||'').replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function toast(t){ var el=document.createElement('div'); el.className='flop-toast'; el.setAttribute('role','status'); el.textContent=t; document.body.appendChild(el); setTimeout(function(){ el.remove(); },3500); }
function modal(html){
  closeModal(); var ov=document.createElement('div'); ov.className='fa-ov'; ov.id='faOv';
  ov.innerHTML='<div class="fa-box" role="dialog" aria-modal="true"><button type="button" class="fa-x" aria-label="Закрыть">×</button>'+html+'</div>';
  ov.addEventListener('click',function(e){ if(e.target===ov||e.target.classList.contains('fa-x')) closeModal(); });
  document.body.appendChild(ov); return ov.querySelector('.fa-box');
}
function closeModal(){ clearInterval(pollT); var o=document.getElementById('faOv'); if(o) o.remove(); }
var stateEl=null;
function setState(s){ if(stateEl) stateEl.dataset.s=s; }
function nav(){
  var n=document.querySelector('.sitenav')||document.querySelector('.top nav'); if(!n) return;
  var a=n.querySelector('.acct');
  if(!a){ a=document.createElement('a'); a.className='acct'; a.href='#'; a.addEventListener('click',function(e){ e.preventDefault(); auth()?account():login(); }); var ref=n.querySelector('.fbk'); ref?n.insertBefore(a,ref):n.appendChild(a); }
  var au=auth(); stateEl=a;
  a.textContent=au?(au.nick||(au.name||'Аккаунт').split(' ')[0]):'Войти';
  a.title=au?'Аккаунт: прогресс сохраняется':'Войти через Telegram, чтобы прогресс не потерялся';
  a.classList.toggle('in',!!au);
  var nd=document.getElementById('authNudge');
  if(nd){ nd.hidden=!!au; if(!au&&!nd.dataset.ok){ nd.dataset.ok='1'; nd.innerHTML='<div><b>Статистика хранится только в этом браузере.</b> Войди через Telegram — она сохранится в аккаунте и будет на всех твоих устройствах.</div><button type="button" class="fa-btn">Войти через Telegram</button>'; nd.querySelector('button').onclick=login; } }
}

window.Flop=window.Flop||{};
Flop.auth={login:login,logout:logout,sync:sync,user:auth,api:api,nick:nickPrompt};
function boot(){ nav(); var a=auth(); if(a){ sync(); if(a.nick===undefined) api('me').then(function(m){ saveNick(m&&m.nick); }).catch(function(){}); } document.dispatchEvent(new Event('flop-auth')); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible'&&auth()&&Date.now()-(+get(LK)||0)>60000) sync(); });
})();
