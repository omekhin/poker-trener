/* Флоп: «Поделиться результатом» — рисует карточку-картинку и отправляет её через системное меню
   (на телефоне сразу в Telegram/WhatsApp), а на компьютере показывает окно со скачиванием и ссылками. */
(function(){
'use strict';
var SITE='https://poker-trener.ru/';
function link(kind){ return SITE+'?utm_source=share&utm_medium='+encodeURIComponent(kind||'card'); }

function wrap(ctx,text,maxW){ var words=String(text).split(' '), lines=[], cur=''; words.forEach(function(w){ var t=cur?cur+' '+w:w; if(ctx.measureText(t).width>maxW&&cur){ lines.push(cur); cur=w; } else cur=t; }); if(cur) lines.push(cur); return lines; }

/* o: {kind, eyebrow, big, sub, stats:[[value,label],...], cards:['Ah','Kd'], text} */
function draw(o){
  var W=1080, H=1350, c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
  var g=x.createRadialGradient(W/2,H*0.38,80,W/2,H*0.45,H*0.8); g.addColorStop(0,'#2b8a63'); g.addColorStop(0.55,'#1f6a4c'); g.addColorStop(1,'#123c2c');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(255,255,255,.08)'; x.lineWidth=3; x.beginPath(); x.ellipse(W/2,H*0.47,W*0.62,H*0.40,0,0,Math.PI*2); x.stroke();
  var D='"Unbounded","Onest",system-ui,sans-serif', B='"Onest",system-ui,sans-serif', Mo='"JetBrains Mono",ui-monospace,monospace';
  x.fillStyle='#fff'; x.textBaseline='alphabetic';
  x.font='700 52px '+D; x.fillText('Флоп',80,130);
  x.font='500 30px '+B; x.fillStyle='rgba(233,244,238,.75)'; x.fillText('покерный тренажёр с тренером',80,178);
  var y=330;
  if(o.eyebrow){ x.font='600 34px '+B; x.fillStyle='#e8c34a'; x.fillText(o.eyebrow.toUpperCase(),80,y); y+=40; }
  x.fillStyle='#fff'; x.font='700 104px '+D;
  wrap(x,o.big,W-160).slice(0,3).forEach(function(l){ y+=112; x.fillText(l,80,y); });
  if(o.sub){ x.font='500 40px '+B; x.fillStyle='rgba(233,244,238,.9)'; y+=30; wrap(x,o.sub,W-160).slice(0,3).forEach(function(l){ y+=54; x.fillText(l,80,y); }); }
  if(o.cards&&o.cards.length){ y+=50; var cx=80; o.cards.forEach(function(cs){ card(x,cx,y,cs); cx+=150; }); y+=200; }
  if(o.stats&&o.stats.length){
    var top=Math.max(y+60,H-430), n=o.stats.length, gap=24, bw=(W-160-gap*(n-1))/n;
    o.stats.forEach(function(s,i){ var bx=80+i*(bw+gap); x.fillStyle='rgba(0,0,0,.22)'; rr(x,bx,top,bw,190,26); x.fill();
      x.fillStyle='#fff'; x.font='700 '+(String(s[0]).length>6?52:64)+'px '+Mo; x.fillText(String(s[0]),bx+30,top+95);
      x.fillStyle='rgba(233,244,238,.8)'; x.font='500 28px '+B; wrap(x,s[1],bw-60).slice(0,2).forEach(function(l,j){ x.fillText(l,bx+30,top+140+j*34); }); });
  }
  x.fillStyle='rgba(0,0,0,.25)'; x.fillRect(0,H-130,W,130);
  x.fillStyle='#fff'; x.font='700 38px '+B; x.fillText('poker-trener.ru',80,H-55);
  x.font='500 28px '+B; x.fillStyle='rgba(233,244,238,.8)'; var t='бесплатно, без ставок'; x.fillText(t,W-80-x.measureText(t).width,H-57);
  return c;
}
/* landscape 1200×630 version for the link preview in Telegram/VK */
function drawWide(o){
  var W=1200, H=630, c=document.createElement('canvas'); c.width=W; c.height=H; var x=c.getContext('2d');
  var g=x.createRadialGradient(W*0.35,H*0.35,60,W*0.45,H*0.5,W*0.8); g.addColorStop(0,'#2b8a63'); g.addColorStop(0.55,'#1f6a4c'); g.addColorStop(1,'#123c2c');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  var D='"Unbounded","Onest",system-ui,sans-serif', B='"Onest",system-ui,sans-serif', Mo='"JetBrains Mono",ui-monospace,monospace';
  x.textBaseline='alphabetic'; x.fillStyle='#fff'; x.font='700 40px '+D; x.fillText('Флоп',64,92); var bw0=x.measureText('Флоп').width;
  x.font='500 24px '+B; x.fillStyle='rgba(233,244,238,.75)'; x.fillText('покерный тренажёр с тренером',64+bw0+20,90);
  var hasRight=(o.stats&&o.stats.length)||(o.cards&&o.cards.length), LW=hasRight?680:W-128, y=180;
  if(o.eyebrow){ x.font='600 26px '+B; x.fillStyle='#e8c34a'; x.fillText(o.eyebrow.toUpperCase(),64,y); y+=16; }
  x.fillStyle='#fff'; var fs=86, lines; [86,72,60].some(function(f){ fs=f; x.font='700 '+fs+'px '+D; lines=wrap(x,o.big,LW); return lines.length<=(f===60?3:1); });
  lines.slice(0,3).forEach(function(l){ y+=fs+8; x.fillText(l,64,y); });
  if(o.sub){ x.font='500 30px '+B; x.fillStyle='rgba(233,244,238,.9)'; y+=18; wrap(x,o.sub,LW).slice(0,2).forEach(function(l){ y+=40; x.fillText(l,64,y); }); }
  if(o.stats&&o.stats.length){
    var st=o.stats.slice(0,3), bh=128, gap=16, top=(H-90-(st.length*bh+(st.length-1)*gap))/2+10, bx=W-64-360;
    st.forEach(function(s,i){ var by=top+i*(bh+gap); x.fillStyle='rgba(0,0,0,.24)'; rr(x,bx,by,360,bh,22); x.fill();
      x.fillStyle='#fff'; x.font='700 '+(String(s[0]).length>6?44:54)+'px '+Mo; x.fillText(String(s[0]),bx+26,by+66);
      x.fillStyle='rgba(233,244,238,.8)'; x.font='500 22px '+B; x.fillText(wrap(x,s[1],310)[0]||'',bx+26,by+102); });
  } else if(o.cards&&o.cards.length){ var cx=W-64-150*o.cards.length+20; o.cards.forEach(function(cs){ card(x,cx,200,cs); cx+=150; }); }
  x.fillStyle='rgba(0,0,0,.25)'; x.fillRect(0,H-74,W,74);
  x.fillStyle='#fff'; x.font='700 30px '+B; x.fillText('poker-trener.ru',64,H-26);
  x.font='500 22px '+B; x.fillStyle='rgba(233,244,238,.8)'; var t='бесплатно, без ставок'; x.fillText(t,W-64-x.measureText(t).width,H-28);
  return c;
}
/* uploads the preview picture and returns a personal link; falls back to the plain site link */
function personalLink(o,fallback){
  var api=window.Flop&&Flop.auth&&Flop.auth.apiUrl; if(!api) return Promise.resolve(fallback);
  var img=drawWide(o).toDataURL('image/jpeg',0.86);
  var req=fetch(api+(api.indexOf('?')>=0?'&':'?')+'a=card',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({img:img,t:o.text||o.big,d:o.sub||'',k:o.kind||'card'})})
    .then(function(r){ return r.ok?r.json():null; }).then(function(r){ return r&&r.url?r.url:fallback; }).catch(function(){ return fallback; });
  return Promise.race([req,new Promise(function(res){ setTimeout(function(){ res(fallback); },7000); })]);
}
function rr(x,a,b,w,h,r){ x.beginPath(); x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }
function card(x,a,b,cs){
  var R={T:'10'}, S={s:['♠','#1a1a1a'],h:['♥','#cf2f2f'],d:['♦','#2d64c8'],c:['♣','#1c8a3e']}, r=R[cs[0]]||cs[0], s=S[cs[1]]||S.s;
  x.save(); x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=18; x.shadowOffsetY=6; x.fillStyle='#fff'; rr(x,a,b,130,180,16); x.fill(); x.restore();
  x.fillStyle=s[1]; x.font='700 72px "JetBrains Mono",monospace'; x.textAlign='center'; x.fillText(r,a+65,b+90); x.font='60px system-ui'; x.fillText(s[0],a+65,b+155); x.textAlign='left';
}

function toast(t){ var el=document.createElement('div'); el.className='flop-toast'; el.setAttribute('role','status'); el.textContent=t; document.body.appendChild(el); setTimeout(function(){ el.remove(); },3000); }
function closeModal(){ var o=document.getElementById('shOv'); if(o) o.remove(); }

function share(o){
  var url=link(o.kind), text=(o.text||o.big)+' — Флоп, бесплатный покерный тренажёр';
  if(window.Flop&&Flop.ev) Flop.ev('share_open',{kind:o.kind});
  var fontsReady=document.fonts&&document.fonts.load?Promise.all([document.fonts.load('700 50px Unbounded'),document.fonts.load('500 30px Onest'),document.fonts.load('700 50px "JetBrains Mono"')]).catch(function(){}):Promise.resolve();
  fontsReady.then(function(){
    var c=draw(o);
    c.toBlob(function(blob){
      var file=new File([blob],'flop-'+(o.kind||'result')+'.png',{type:'image/png'});
      var canFile=!!(navigator.canShare&&navigator.canShare({files:[file]}));
      var src=URL.createObjectURL(blob), ov=document.createElement('div'); closeModal(); ov.id='shOv'; ov.className='fa-ov';
      var tgFor=function(u){ return 'https://t.me/share/url?url='+encodeURIComponent(u)+'&text='+encodeURIComponent(text); }, tg=tgFor(url);
      ov.innerHTML='<div class="fa-box sh-box" role="dialog" aria-modal="true" aria-label="Поделиться"><button type="button" class="fa-x" aria-label="Закрыть">×</button><h3>Поделиться</h3><img class="sh-img" alt="Карточка с результатом" src="'+src+'">'
        +(canFile?'<button type="button" class="fa-btn" data-via="native">Отправить картинку</button><div class="fa-row"><a class="fa-sec sh-dl" href="'+tg+'" target="_blank" rel="noopener" data-via="tg">Ссылку в Telegram</a><a class="fa-sec sh-dl" href="'+src+'" download="'+file.name+'" data-via="png">Скачать</a></div>'
                 :'<div class="fa-row"><a class="fa-btn" href="'+tg+'" target="_blank" rel="noopener" data-via="tg">Отправить в Telegram</a><a class="fa-sec sh-dl" href="'+src+'" download="'+file.name+'" data-via="png">Скачать картинку</a></div>')
        +'<button type="button" class="fa-link" data-via="copy">Скопировать текст со ссылкой</button><p class="fa-sm">'+(canFile?'«Отправить картинку» откроет меню телефона — выбери Telegram или любой чат.':'Картинку можно скачать и приложить к сообщению в любом чате.')+'</p></div>';
      ov.addEventListener('click',function(e){
        if(e.target===ov||e.target.classList.contains('fa-x')){ closeModal(); return; }
        var v=e.target.closest('[data-via]'); if(!v) return;
        if(window.Flop&&Flop.ev) Flop.ev('share_done',{kind:o.kind,via:v.dataset.via});
        if(v.dataset.via==='native'){ navigator.share({files:[file]}).catch(function(){}); return; }
        if(v.dataset.via==='copy'){ var t=text+' '+url; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ toast('Скопировано — вставь в чат'); },function(){ prompt('Скопируй:',t); }); }
      });
      document.body.appendChild(ov);
      /* personal link with this result as the preview picture */
      var tgA=ov.querySelector('[data-via="tg"]'); if(tgA){ tgA.classList.add('sh-wait'); tgA.dataset.label=tgA.textContent; tgA.textContent='Готовлю ссылку…'; }
      personalLink(o,url).then(function(u){ url=u; if(tgA){ tgA.href=tgFor(u); tgA.textContent=tgA.dataset.label; tgA.classList.remove('sh-wait'); } });
    },'image/png');
  });
}
window.Flop=window.Flop||{};
Flop.share=share;
})();
