/* Флоп: plain-Russian explanation of a showdown — what each hand is and why one beats another.
   Needs a global evalHand(cards) -> score (category*1e6 + kickers), as in play.html and ranges.js.
   Cards are ints: rank = c>>2 (0 = двойка … 12 = туз), suit = c&3. */
(function(){
const NOM=['двойка','тройка','четвёрка','пятёрка','шестёрка','семёрка','восьмёрка','девятка','десятка','валет','дама','король','туз'];
const GEN=['двойки','тройки','четвёрки','пятёрки','шестёрки','семёрки','восьмёрки','девятки','десятки','валета','дамы','короля','туза'];
const PL =['двойки','тройки','четвёрки','пятёрки','шестёрки','семёрки','восьмёрки','девятки','десятки','вальты','дамы','короли','тузы'];
const PLG=['двоек','троек','четвёрок','пятёрок','шестёрок','семёрок','восьмёрок','девяток','десяток','вальтов','дам','королей','тузов'];
const masc=r=>r===9||r===11||r===12;
const CAT =['старшая карта','пара','две пары','трипс','стрит','флеш','фулл-хаус','каре','стрит-флеш'];
const CATG=['старшей карты','пары','двух пар','трипса','стрита','флеша','фулл-хауса','каре','стрит-флеша'];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

function best5(cards){
  if(cards.length<=5) return {cards:cards.slice(),score:evalHand(cards)};
  let best=null; const n=cards.length;
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
    const five=cards.filter((_,k)=>k!==i&&k!==j); const s=evalHand(five);
    if(!best||s>best.score) best={cards:five,score:s};
  }
  return best;
}

function describe(hole,board){
  const b=best5([...hole,...board]); const cat=Math.floor(b.score/1e6);
  const cnt={}; b.cards.forEach(c=>{ const r=c>>2; cnt[r]=(cnt[r]||0)+1; });
  const by=n=>Object.keys(cnt).map(Number).filter(r=>cnt[r]===n).sort((x,y)=>y-x);
  const desc=b.cards.map(c=>c>>2).sort((x,y)=>y-x);
  let text, short=CAT[cat], shortG=CATG[cat], main=[], kick=[];
  switch(cat){
    case 0: main=[desc[0]]; kick=desc.slice(1); text='старшая карта — '+NOM[desc[0]]; break;
    case 1: main=by(2); kick=by(1); text='пара '+PLG[main[0]]; break;
    case 2: main=by(2); kick=by(1); text='две пары — '+PL[main[0]]+' и '+PL[main[1]]; break;
    case 3: { main=by(3); kick=by(1); const t=main[0];
      const set=hole.length===2&&(hole[0]>>2)===t&&(hole[1]>>2)===t;
      short=set?'сет':'трипс'; shortG=set?'сета':'трипса'; text=short+' '+PLG[t]; break; }
    case 4: case 8: { const hi=(desc[0]===12&&desc[1]===3)?3:desc[0]; main=[hi];
      text=cat===8?(hi===12?'роял-флеш':'стрит-флеш до '+GEN[hi]):'стрит до '+GEN[hi]; break; }
    case 5: main=desc; text='флеш от '+GEN[desc[0]]; break;
    case 6: { const t=by(3)[0], p=by(2)[0]; main=[t,p];
      text=`фулл-хаус — три ${GEN[t]} и ${masc(p)?'два':'две'} ${GEN[p]}`; break; }
    case 7: main=by(4); kick=by(1); text='каре '+PLG[main[0]]; break;
  }
  return {cat,score:b.score,text,short,shortG,main,kick,cards:b.cards,boardPlays:b.cards.every(c=>board.includes(c))};
}

/* Why hand a beats (or ties) hand b — one or two short sentences. */
function why(a,b){
  if(a.score===b.score) return a.boardPlays&&b.boardPlays
    ? 'Лучшие пять карт у обоих лежат на столе, поэтому руки равны и банк делится.'
    : 'Руки равны по силе, поэтому банк делится.';
  if(a.cat!==b.cat) return `${cap(a.short)} старше ${b.shortG}.`;
  for(let i=0;i<a.main.length;i++){
    const x=a.main[i], y=b.main[i]; if(x===y) continue;
    switch(a.cat){
      case 0: return `${cap(NOM[x])} старше ${GEN[y]}.`;
      case 1: return `Пара ${PLG[x]} старше пары ${PLG[y]}.`;
      case 2: return i===0?`Сравнивают старшие пары: ${PL[x]} старше ${PLG[y]}.`:`Старшие пары одинаковые, решает вторая: ${PL[x]} старше ${PLG[y]}.`;
      case 3: case 7: return `${cap(PL[x])} старше ${PLG[y]}.`;
      case 4: case 8: return `Стрит до ${GEN[x]} старше стрита до ${GEN[y]}.`;
      case 5: return i===0?`Флеш от ${GEN[x]} старше флеша от ${GEN[y]}.`:`Старшие карты флешей совпали, сравниваем дальше: ${NOM[x]} старше ${GEN[y]}.`;
      case 6: return i===0?`В фулл-хаусе сначала сравнивают тройки: ${PL[x]} старше ${PLG[y]}.`:`Тройки одинаковые, решают пары: ${PL[x]} старше ${PLG[y]}.`;
    }
  }
  for(let i=0;i<a.kick.length;i++){
    const x=a.kick[i], y=b.kick[i]; if(x===y) continue;
    if(a.cat===0) return `Старшие карты совпали, решает следующая: ${NOM[x]} старше ${GEN[y]}.`;
    return `Комбинация одинаковая, поэтому решает кикер — следующая по старшинству карта: ${NOM[x]} старше ${GEN[y]}.`;
  }
  return '';
}

window.FlopSD={describe,why,best5,NOM,GEN,PLG};
})();
