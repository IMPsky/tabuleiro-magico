/* ================= sons (gerados na hora, sem arquivos) ================= */
const Sfx = (() => {
  let ctx = null;
  const ac = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch (e) { ctx = null; } return ctx; };
  const tone = (f, t0, dur, type = "sine", vol = .18) => { const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .05); };
  return {
    crystal(){ const b = 1700 + Math.random() * 900; tone(b, 0, .4, "sine", .16); tone(b * 2.01, 0, .25, "sine", .07); tone(b * 3.03, .004, .14, "triangle", .04); },
    shine(){ [1046, 1318, 1568, 2093, 2637].forEach((f, i) => tone(f, i * .06, .55, "sine", .11)); tone(4186, .32, .7, "sine", .05); tone(3136, .4, .6, "sine", .04); },
    fail(){ tone(220, 0, .25, "triangle", .14); tone(160, .08, .3, "triangle", .1); },
    hit(){ tone(150, 0, .16, "square", .1); tone(85, .02, .25, "sine", .2); },
    pickup(){ [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(f, i * .07, .4, "triangle", .09)); }
  };
})();

/* ================= game: rules ================= */
const statOf = p => p.st;
const isEnemy = (g,a,b) => g.team[a]!==g.team[b];
const sidesOfTeam = (g,T) => g.order.filter(s=>g.team[s]===T);
const teamName = (g,T) => sidesOfTeam(g,T).map(s=>g.players[s].name).join(" e ");
const otherTeam = T => T==="A"?"B":"A";
const myTeam = () => (G && mySide) ? G.team[mySide] : "A";
/* intervalos (placas e pergaminhos) só correm durante a vez de um adversário */
const runsFor = (g,side) => g.status==="playing" && isEnemy(g,g.turn,side);
function pieceCd(g,p,now){ let rem=p.cd||0; if(rem>0 && runsFor(g,p.owner)) rem-=now-g.turnStartedAt; return Math.max(0,rem); }
function cdLeft(g,side,eff,now){ let rem=g.cds[side][eff]||0; if(rem>0 && runsFor(g,side)) rem-=now-g.turnStartedAt; return Math.max(0,rem); }
const at = (g,r,c) => g.pieces.find(p=>p.r===r&&p.c===c);
const structAt = (g,r,c) => g.structures.find(s=>s.r===r&&s.c===c);
const trapAt = (g,r,c) => g.traps.find(t=>t.r===r&&t.c===c);
const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function moveTargets(g,p){
  const out=new Map(); const d=g.dice.andar; const st=statOf(p);
  if(!d.v||d.used||p.dead||p.sealHp>0||st.andar<=0) return out;
  const lim=Math.min(d.v,st.andar); const seen=new Map([[p.r+","+p.c,null]]); let fr=[[p.r,p.c]];
  for(let s=0;s<lim;s++){ const nx=[]; for(const [r,c] of fr) for(const [dr,dc] of D8){ const R=r+dr,C=c+dc,k=R+","+C;
      if(R<0||R>7||C<0||C>7||seen.has(k)||at(g,R,C)||structAt(g,R,C)) continue; const tr=trapAt(g,R,C); if(tr&&tr.owner===p.owner) continue;
      seen.set(k,r+","+c); nx.push([R,C]); out.set(k,true); } fr=nx; }
  for(const k of out.keys()){ const path=[]; let cur=k; while(cur && cur!==p.r+","+p.c){ path.unshift(cur.split(",").map(Number)); cur=seen.get(cur); } out.set(k,path); }
  return out;
}
function lineClear(g,a,b,c,d){
  const n=Math.max(Math.abs(c-a),Math.abs(d-b)); for(let i=1;i<n;i++){ const r=Math.round(a+(c-a)*i/n), cc=Math.round(b+(d-b)*i/n); if(structAt(g,r,cc)) return false; } return true;
}
function attackTargets(g,p,now){
  const out=new Map(); const A=g.dice.atacar,F=g.dice.forca; const st=statOf(p);
  if(!A.v||A.used||!F.v||F.used||p.dead||st.forca<=0||st.atq<=0||pieceCd(g,p,now)>0) return out;
  const range=Math.min(A.v,st.atq);
  for(const q of g.pieces){ if(q.dead) continue; const enemy=isEnemy(g,q.owner,p.owner), seal=!enemy&&q.sealHp>0;
    if(!enemy&&!seal) continue; const d=cheb(p.r,p.c,q.r,q.c); if(d>range) continue; if(d>1&&!lineClear(g,p.r,p.c,q.r,q.c)) continue;
    out.set(q.r+","+q.c,{kind:seal?"seal":"piece",id:q.id}); }
  for(const s of g.structures){ if(!isEnemy(g,s.owner,p.owner)) continue; const d=cheb(p.r,p.c,s.r,s.c); if(d>range) continue; if(d>1&&!lineClear(g,p.r,p.c,s.r,s.c)) continue; out.set(s.r+","+s.c,{kind:"struct",id:s.id}); }
  return out;
}
function damageOf(g,att,target){
  const st=att.st; let d=Math.min(g.dice.forca.v,st.forca), parts=[`${d} de força`];
  if(att.element){ d+=g.rules.bonusElemento; parts.push(`+${g.rules.bonusElemento} ${ELEMENTS[att.element].name}`);
    if(target?.element && ELEMENTS[att.element].strong.includes(target.element)){ d+=g.rules.bonusVantagem; parts.push(`+${g.rules.bonusVantagem} vantagem`); }
    if(g.field && g.field.el===att.element){ d+=g.rules.bonusCampo; parts.push(`+${g.rules.bonusCampo} campo`); } }
  return {d,parts};
}
const fx = (g,item) => g.fx.items.push(item);
function endRound(g,winT,why){
  g.status="finished"; g.winner=winT; addLog(g,why);
  const S=g.series; S.score[winT]++;
  if(S.score[winT]>=g.rules.vitoriasSerie){ S.done=true; S.winner=winT; addLog(g,`${teamName(g,winT)} ${sidesOfTeam(g,winT).length>1?"venceram":"venceu"} a série por ${S.score[winT]} x ${S.score[otherTeam(winT)]}.`); }
  else addLog(g,`Placar da série: ${teamName(g,"A")} ${S.score.A} x ${S.score.B} ${teamName(g,"B")}.`);
}
function eliminate(g,side,why){
  g.out[side]=true;
  for(const q of g.pieces) if(q.owner===side && !q.dead){ q.dead=true; q.hp=0; q.sealHp=0; q.element=null; }
  addLog(g,why);
  const T=g.team[side]; if(sidesOfTeam(g,T).every(s=>g.out[s])) endRound(g,otherTeam(T),g.mode==="2x2"?`O time de ${teamName(g,T)} caiu.`:`${g.players[side].name} perdeu o duelo.`);
}
function kill(g,p){
  if(p.type==="nucleo"){ p.hp=0; eliminate(g,p.owner,`O Núcleo de ${g.players[p.owner].name} foi destruído!`); return; }
  p.dead=true; p.hp=0; p.sealHp=0; p.element=null; addLog(g,`${pname(p)} de ${g.players[p.owner].name} caiu e virou lápide.`);
}
/* ---- pergaminho de feitiço que aparece no centro do tabuleiro ---- */
function spawnSpell(g,now){
  g.spellN=(g.spellN||0)+1; g.spellNext=now+g.rules.feiticoMin*60000*(g.spellN+1);
  if(g.spell) return false;
  const free=(r,c)=>!at(g,r,c)&&!structAt(g,r,c)&&!trapAt(g,r,c);
  let cells=[[3,3],[3,4],[4,3],[4,4]].filter(([r,c])=>free(r,c));
  if(!cells.length){ for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(free(r,c)) cells.push([r,c]); cells.sort((a,b)=>cheb(a[0],a[1],3.5,3.5)-cheb(b[0],b[1],3.5,3.5)); cells=cells.slice(0,4); }
  if(!cells.length) return false;
  const [r,c]=cells[Math.floor(Math.random()*cells.length)], cb=pick(g.combos);
  g.spell={r,c,comboId:cb.id}; addLog(g,"Um pergaminho de feitiço apareceu no centro do tabuleiro! Pise nele para ganhar um efeito pronto.");
  fx(g,{k:"spell",to:[r,c]}); return true;
}
function pickupSpell(g,side,p){
  const cb=g.combos.find(c=>c.id===g.spell.comboId); g.spell=null; if(!cb) return;
  const sc=g.scrolls[side]; let i=sc.findIndex(x=>x.state!=="ready"); if(i<0) i=0;
  sc[i]={state:"ready",c:[cb.c1,cb.c2,cb.c3],comboId:cb.id,effect:cb.effect,mana:cb.mana,cd:cb.cooldown,free:true};
  if(!g.found[side].includes(cb.id)) g.found[side].push(cb.id);
  addLog(g,`${pname(p)} de ${g.players[side].name} pegou o pergaminho de feitiço.`);
  fx(g,{k:"pickup",to:[p.r,p.c],side});
}
function doMove(pid,r,c){
  return commit((g,now)=>{ const p=g.pieces.find(x=>x.id===pid); const paths=moveTargets(g,p); const path=paths.get(r+","+c); if(!path) return false;
    let stop=null, steps=0;
    for(const [R,C] of path){ p.r=R; p.c=C; steps++;
      if(g.spell && g.spell.r===R && g.spell.c===C) pickupSpell(g,p.owner,p);
      const t=trapAt(g,R,C); if(t&&t.owner!==p.owner&&isEnemy(g,t.owner,p.owner)){ stop=t; break; } }
    g.dice.andar.used=true; addLog(g,`${p.type==="nucleo"?`O Núcleo de ${g.players[p.owner].name}`:pname(p)} andou ${steps} casa${steps>1?"s":""}.`);
    if(stop){ const prev=p.hp/p.maxHp; g.traps=g.traps.filter(t=>t!==stop); p.hp-=g.rules.armadilhaDano; addLog(g,`Armadilha! ${pname(p)} sofreu ${g.rules.armadilhaDano} de dano.`);
      fx(g,{k:"hit",to:[p.r,p.c],dmg:g.rules.armadilhaDano,id:p.id,prev}); if(p.hp<=0) kill(g,p); }
  });
}
function doAttack(pid,t){
  return commit((g,now)=>{ const p=g.pieces.find(x=>x.id===pid); const opts=attackTargets(g,p,now);
    const tg = t.kind==="struct" ? g.structures.find(s=>s.id===t.id) : g.pieces.find(x=>x.id===t.id); if(!tg||!opts.has(tg.r+","+tg.c)) return false;
    const {d,parts}=damageOf(g,p,t.kind==="piece"?tg:null); const nm=pname(p), prev=(tg.hp||0)/(tg.maxHp||1);
    if(t.kind==="seal"){ tg.sealHp=Math.max(0,tg.sealHp-d); addLog(g,`${nm} golpeou o selo (${d}). ${tg.sealHp?`Restam ${tg.sealHp}.`:"Selo quebrado!"}`); fx(g,{k:"hit",from:[p.r,p.c],to:[tg.r,tg.c],dmg:d}); }
    else if(t.kind==="struct"){ tg.hp-=d; addLog(g,`${nm} atingiu uma estrutura: ${d} de dano.`); fx(g,{k:"hit",from:[p.r,p.c],to:[tg.r,tg.c],dmg:d,id:tg.id,prev}); if(tg.hp<=0){ g.structures=g.structures.filter(s=>s!==tg); addLog(g,"A estrutura desabou."); } }
    else { tg.hp-=d; addLog(g,`${nm} atacou ${tg.type==="nucleo"?"o Núcleo de "+g.players[tg.owner].name:pname(tg)}: ${d} de dano (${parts.join(", ")}).`); fx(g,{k:"hit",from:[p.r,p.c],to:[tg.r,tg.c],dmg:d,id:tg.id,prev}); if(tg.hp<=0) kill(g,tg); }
    g.dice.atacar.used=g.dice.forca.used=true; p.cd=p.st.intervalo*1000;
  });
}

/* ---- scrolls & effects ---- */
const activeCombos = () => (G&&G.combos) || [];
function findCombo(ids){ const k=[...ids].sort().join("|"); return activeCombos().find(c=>[c.c1,c.c2,c.c3].sort().join("|")===k); }
function effectTargets(g,eff,side){
  const out=new Set(); const E=EFFECTS[eff]; if(!E) return out; const mine=g.pieces.filter(p=>p.owner===side&&!p.dead);
  const near=(r,c)=>mine.some(p=>cheb(p.r,p.c,r,c)===1);
  if(E.target==="ownPiece") for(const p of mine){ if(p.type==="nucleo"&&!E.core) continue; out.add(p.r+","+p.c); }
  if(E.target==="ownTomb") for(const p of g.pieces) if(p.owner===side&&p.dead&&p.type!=="nucleo") out.add(p.r+","+p.c);
  if(E.target==="emptyNearOwn") for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(!at(g,r,c)&&!structAt(g,r,c)&&!trapAt(g,r,c)&&!(g.spell&&g.spell.r===r&&g.spell.c===c)&&near(r,c)) out.add(r+","+c);
  if(E.target==="enemyNearOwn") for(const p of g.pieces) if(isEnemy(g,p.owner,side)&&!p.dead&&p.type!=="nucleo"&&!p.sealHp&&near(p.r,p.c)) out.add(p.r+","+p.c);
  return out;
}
function canUseScroll(g,s){
  const now=gnow(); if(!isMyTurn()) return "Espere a sua vez para usar o pergaminho.";
  const left=cdLeft(g,mySide,s.effect,now); if(left>0) return `${EFFECTS[s.effect].name} ainda recarrega: faltam ${Math.ceil(left/1000)}s, que só correm na vez do adversário.`;
  if(g.mana[mySide]<s.mana) return `Mana insuficiente: precisa de ${s.mana}.`;
  return null;
}
function useScroll(i,r,c,side=mySide,el=null){
  const mySide=side; selScroll=null;
  return commit((g,now)=>{ const s=g.scrolls[mySide][i]; if(s.state!=="ready") return false; const E=EFFECTS[s.effect]; if(!E) return false;
    if(cdLeft(g,mySide,s.effect,now)>0 || g.mana[mySide]<s.mana) return false;
    if(E.target==="field" && !ELEMENTS[el]) return false;
    if(E.target!=="none" && E.target!=="field" && !effectTargets(g,s.effect,mySide).has(r+","+c)) return false;
    const R=g.rules, me_=g.players[mySide].name; const p=(E.target==="none"||E.target==="field")?null:at(g,r,c);
    if(s.effect==="curar"){ const before=p.hp; p.hp=Math.min(p.maxHp,p.hp+R.curaValor); addLog(g,`${me_} curou ${pname(p)} (+${p.hp-before}).`); fx(g,{k:"heal",to:[r,c],amt:p.hp-before}); }
    else if(s.effect==="ressuscitar"){ p.dead=false; p.hp=p.maxHp; p.cd=0; addLog(g,`${me_} ressuscitou ${pname(p)}.`); fx(g,{k:"heal",to:[r,c],amt:p.hp}); }
    else if(s.effect==="armadilha"){ g.traps.push({id:uidStr(),owner:mySide,r,c,until:now+R.armadilhaDuracao*1000}); addLog(g,`${me_} armou uma armadilha escondida.`); }
    else if(s.effect==="estrutura"){ g.structures.push({id:uidStr(),owner:mySide,r,c,hp:R.estruturaVida,maxHp:R.estruturaVida}); addLog(g,`${me_} ergueu uma estrutura.`); }
    else if(s.effect==="selamento"){ p.sealHp=R.seloVida; addLog(g,`${me_} selou ${pname(p)}.`); }
    else if(s.effect==="recMana"){ g.timed.push({kind:"mana",owner:mySide,start:now,every:1000,total:R.recManaSeg,amt:R.recManaQtd,done:0}); addLog(g,`${me_} ativou Recuperação de mana.`); }
    else if(s.effect==="recVida"){ g.timed.push({kind:"vida",owner:mySide,start:now,every:60000,total:R.recVidaMin,amt:R.recVidaQtd,done:0}); addLog(g,`${me_} ativou Recuperação de vida no núcleo.`); }
    else if(s.effect==="campo"){ g.field={el,by:mySide}; addLog(g,`${me_} criou um Campo de ${ELEMENTS[el].name}: placas de ${ELEMENTS[el].name} causam +${R.bonusCampo} de dano.`); }
    else if(E.element){ p.element=E.element; addLog(g,`${pname(p)} recebeu o elemento ${ELEMENTS[E.element].name}.`); }
    g.mana[mySide]-=s.mana; g.cds[mySide][s.effect]=(s.cd||0)*1000; g.scrolls[mySide][i]={state:"empty"};
  });
}

/* ================= série, duelos e turnos ================= */
function buildPieces(g){
  const pieces=[]; let n=0;
  for(const side of g.order){
    const L=layoutFor(g.mode,side), maxP=g.mode==="2x2"?MAX_PLATES_2X2:MAX_PLATES;
    pieces.push({id:"k"+(n++),owner:side,type:"nucleo",plate:-1,name:"",st:{vida:g.rules.nucleoVidaBase,forca:0,atq:0,andar:g.rules.nucleoAndar,intervalo:0},r:L.core[0],c:L.core[1],hp:g.rules.nucleoVidaBase,maxHp:g.rules.nucleoVidaBase,element:null,cd:0,sealHp:0,dead:false});
    g.arsenals[side].slice(0,maxP).forEach((pl,i)=>{ const st=plateStats(pl), [r,c]=L.slots[i];
      pieces.push({id:"k"+(n++),owner:side,type:"placa",plate:i,name:pl.name||"",st,r,c,hp:st.vida,maxHp:st.vida,element:null,cd:0,sealHp:0,dead:false}); });
  }
  return pieces;
}
function startRound(g,now){
  const first = g.order[(g.series.round-1)%g.order.length];
  const per = v => Object.fromEntries(g.order.map(s=>[s,typeof v==="function"?v(s):clone(v)]));
  Object.assign(g,{status:"playing",winner:null,turn:first,turnNo:1,turnStartedAt:now,turnEndsAt:now+g.turnSec*1000+2000,dice:freshDice(),
    structures:[],traps:[],timed:[],field:null,spell:null,spellN:0,spellNext:now+g.rules.feiticoMin*60000,out:{},
    mana:per(g.rules.manaBase),manaMax:per(g.rules.manaBase),scrolls:per([{state:"empty"},{state:"empty"},{state:"empty"}]),cds:per({}),fx:{seq:(g.fx?.seq||0)+1,items:[]}});
  g.pieces=buildPieces(g);
  g.log=[{t:Date.now(),x:`Duelo ${g.series.round} da série. ${g.players[first].name} começa.`}];
}
/* players: [{key,name,ai?,arsenal}] na ordem p1, p2, p3, p4 */
function newSeries(id,r,mode,players,combos){
  const now=gnow(), order=SIDES[mode];
  const g={roomId:id,title:r.title,turnSec:r.turnSec,mode,order,team:Object.fromEntries(order.map(s=>[s,TEAM[s]])),
    players:Object.fromEntries(order.map((s,i)=>[s,{key:players[i].key,name:players[i].name,...(players[i].ai?{ai:true}:{})}])),
    rules:clone(RULES),combos,arsenals:Object.fromEntries(order.map((s,i)=>[s,sanitizeArsenal(players[i].arsenal)])),
    found:Object.fromEntries(order.map(s=>[s,[]])),series:{round:1,score:{A:0,B:0},done:false,winner:null},createdAt:now,updatedAt:now,seq:1};
  startRound(g,now); return g;
}
const freshDice = () => ({andar:{v:null,used:false},atacar:{v:null,used:false},forca:{v:null,used:false}});
function endTurn(g,now,why){
  const cur=g.turn, elapsed=Math.max(0,now-(g.turnStartedAt||now));
  addLog(g, why==="tempo"?`Tempo esgotado para ${g.players[cur].name}.`:`${g.players[cur].name} passou a vez.`);
  // o tempo deste turno conta para os intervalos dos adversários de quem jogou
  for(const s of g.order) if(isEnemy(g,cur,s)) for(const k of Object.keys(g.cds[s])) g.cds[s][k]=Math.max(0,g.cds[s][k]-elapsed);
  for(const q of g.pieces) if(q.cd>0 && isEnemy(g,cur,q.owner)) q.cd=Math.max(0,q.cd-elapsed);
  let i=g.order.indexOf(cur), nx=cur; for(let k=0;k<g.order.length;k++){ i=(i+1)%g.order.length; if(!g.out[g.order[i]]){ nx=g.order[i]; break; } }
  g.turn=nx; g.turnNo++; g.turnStartedAt=now; g.turnEndsAt=now+g.turnSec*1000; g.dice=freshDice();
  g.mana[nx]=Math.min(g.manaMax[nx],g.mana[nx]+g.rules.manaPorTurno);
}
function settle(g,now){
  for(const e of g.timed){ const due=Math.min(e.total,Math.floor((now-e.start)/e.every)); const add=(due-e.done)*e.amt;
    if(add>0){ if(e.kind==="mana") g.mana[e.owner]=Math.min(g.manaMax[e.owner],g.mana[e.owner]+add); else { const c=g.pieces.find(p=>p.owner===e.owner&&p.type==="nucleo"&&!p.dead); if(c) c.hp=Math.min(c.maxHp,c.hp+add); } }
    e.done=due; }
  g.timed=g.timed.filter(e=>e.done<e.total); g.traps=g.traps.filter(t=>t.until>now); return g;
}
const V = () => settle(clone(G),gnow());
function addLog(g,x){ g.log.push({t:Date.now(),x}); if(g.log.length>40) g.log=g.log.slice(-40); }

/* ================= AI opponent (1x1) ================= */
function startAiGame(level){
  const bot = {key:"__ia", name: level==="facil"?"Aprendiz (IA)":"Arquimago (IA)", ai:true, arsenal:randomArsenal()};
  const g = newSeries("ia-"+Date.now(), {title:"Série contra a IA", turnSec:90}, "1x1", [{key:me.key,name:me.name,arsenal:publicArsenal(myArsenal())}, bot], genCombos());
  g.ai=true; g.aiLevel=level; aiGame=g;
  IMGS={p1:myImgs(), p2:{plates:[]}};
  openLocal(g);
}
function openLocal(g){
  G=clone(g); gameId=g.roomId; mySide="p1"; fxSeen=G.fx?.seq;
  sel=inspect=selScroll=null; pending=[]; spinning={};
  showScreen("game"); $("#endOverlay").hidden=true; renderGame();
  if(G.status==="finished") onFinished(); else maybeAi();
}
function maybeAi(){ if(G&&G.ai&&G.status==="playing"&&G.turn==="p2"&&!aiRunning) aiTurn(); }
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function aiTurn(){
  aiRunning=true; const tn=G.turnNo, rd=G.series.round, gid=gameId, easy=G.aiLevel==="facil";
  const alive = () => G && G.ai && gameId===gid && G.status==="playing" && G.turn==="p2" && G.turnNo===tn && G.series.round===rd && !$("#scr-game").hidden;
  try{
    await wait(900); if(!alive()) return;
    await aiScrolls(easy); if(!alive()) return;
    for(const k of ["andar","atacar","forca"]){
      spinning[k]=true; renderDice(); await wait(550); spinning[k]=false; if(!alive()) return;
      await commit(g=>{ if(g.turnNo!==tn||g.dice[k].v!=null) return false; g.dice[k].v=rnd6(); addLog(g,`${g.players.p2.name} tirou ${g.dice[k].v} no dado ${{andar:"Andar",atacar:"Atacar",forca:"Força"}[k]}.`); });
      await wait(250);
    }
    let a=aiBestAttack(V(),easy); if(a && alive()){ await doAttack(a.pid,a.t); await wait(900); }
    if(!alive()) return;
    const m=aiBestMove(V(),easy); if(m){ await doMove(m.pid,m.r,m.c); await wait(800); }
    if(!alive()) return;
    if(!G.dice.atacar.used){ a=aiBestAttack(V(),easy); if(a){ await doAttack(a.pid,a.t); await wait(900); } }
    if(!alive()) return;
    await commit((g,now)=>{ if(g.turnNo!==tn||g.status!=="playing") return false; endTurn(g,now,"passou"); });
  } finally { aiRunning=false; }
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function aiBestAttack(g,easy){
  const now=gnow(), opts=[];
  for(const p of g.pieces){ if(p.owner!=="p2"||p.dead) continue;
    for(const [k,t] of attackTargets(g,p,now)){
      const tg = t.kind==="struct" ? g.structures.find(s=>s.id===t.id) : g.pieces.find(x=>x.id===t.id);
      const {d}=damageOf(g,p,t.kind==="piece"?tg:null); let sc=d;
      if(t.kind==="piece"){ if(tg.type==="nucleo") sc+=6; if(tg.hp<=d) sc+=10; sc+=tg.st.forca*.4; }
      else if(t.kind==="seal") sc+=4; else sc*=.5;
      opts.push({pid:p.id,t,sc}); } }
  if(!opts.length) return null; if(easy) return pick(opts);
  return opts.sort((a,b)=>b.sc-a.sc)[0];
}
function aiPosScore(g,p,r,c){
  const st=p.st, core=g.pieces.find(x=>x.owner==="p1"&&x.type==="nucleo");
  const want=Math.max(1,Math.min(st.atq,3)); let sc=-Math.abs(cheb(r,c,core.r,core.c)-want)*1.2;
  const enemies=g.pieces.filter(x=>x.owner==="p1"&&!x.dead);
  let near=99, danger=0; for(const e of enemies){ const d=cheb(r,c,e.r,e.c); if(e.type!=="nucleo") near=Math.min(near,d);
    if(e.type!=="nucleo"&&d<=Math.min(6,e.st.atq)) danger+=e.st.forca*.15; }
  if(enemies.some(e=>cheb(r,c,e.r,e.c)<=st.atq)) sc+=3;
  if(g.spell) sc-=cheb(r,c,g.spell.r,g.spell.c)*.6;
  sc-=near*.25; sc-=danger*(p.hp<p.maxHp*.5?1.5:.6);
  return sc;
}
function aiBestMove(g,easy){
  const opts=[];
  for(const p of g.pieces){ if(p.owner!=="p2"||p.dead||p.type==="nucleo") continue;
    const base=aiPosScore(g,p,p.r,p.c);
    for(const k of moveTargets(g,p).keys()){ const [r,c]=k.split(",").map(Number); opts.push({pid:p.id,r,c,sc:aiPosScore(g,p,r,c)-base+(g.spell&&g.spell.r===r&&g.spell.c===c?8:0)}); } }
  if(!opts.length) return null; if(easy) return pick(opts);
  opts.sort((a,b)=>b.sc-a.sc); return opts[0].sc>-0.5?opts[0]:null;
}
async function aiScrolls(easy){
  const side="p2"; let g=V();
  let mine, core, enemies, threat;
  const refresh = () => { g=V(); mine=g.pieces.filter(p=>p.owner===side&&!p.dead); core=mine.find(p=>p.type==="nucleo");
    enemies=g.pieces.filter(p=>p.owner!==side&&!p.dead); threat=!!core&&enemies.some(e=>e.type!=="nucleo"&&cheb(e.r,e.c,core.r,core.c)<=3); };
  refresh(); if(!core) return;
  const bestFieldEl = () => { const cnt={}; for(const p of mine) if(p.element) cnt[p.element]=(cnt[p.element]||0)+p.st.forca; const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]; return best&&(!g.field||g.field.el!==best[0])?best[0]:null; };
  const wantTarget = eff => {
    if(eff==="campo"){ const el=bestFieldEl(); return el?[-1,-1,el]:null; }
    const tg=[...effectTargets(g,eff,side)].map(k=>k.split(",").map(Number)); if(!tg.length && EFFECTS[eff]?.target!=="none") return null;
    if(eff==="curar"){ const hurt=mine.filter(p=>p.hp<p.maxHp*.6).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]; return hurt?[hurt.r,hurt.c]:null; }
    if(eff==="ressuscitar"){ const t=g.pieces.filter(p=>p.owner===side&&p.dead&&p.type!=="nucleo").sort((a,b)=>b.st.forca-a.st.forca)[0]; return t?[t.r,t.c]:null; }
    if(eff==="estrutura"){ if(!threat) return null; const cs=tg.filter(([r,c])=>cheb(r,c,core.r,core.c)===1); if(!cs.length) return null;
      return cs.sort((a,b)=>Math.min(...enemies.map(e=>cheb(a[0],a[1],e.r,e.c)))-Math.min(...enemies.map(e=>cheb(b[0],b[1],e.r,e.c))))[0]; }
    if(eff==="armadilha") return tg.sort((a,b)=>Math.min(...enemies.map(e=>cheb(a[0],a[1],e.r,e.c)))-Math.min(...enemies.map(e=>cheb(b[0],b[1],e.r,e.c))))[0];
    if(eff==="selamento"){ const t=enemies.filter(e=>tg.some(([r,c])=>r===e.r&&c===e.c)).sort((a,b)=>b.st.forca-a.st.forca)[0]; return t?[t.r,t.c]:null; }
    if(eff==="recMana") return g.mana[side]<g.manaMax[side]*.6?[-1,-1]:null;
    if(eff==="recVida") return core.hp<core.maxHp*.85?[-1,-1]:null;
    if(EFFECTS[eff]?.element){ const t=mine.filter(p=>p.type!=="nucleo"&&!p.element).sort((a,b)=>b.st.forca-a.st.forca)[0]; return t?[t.r,t.c]:null; }
    return null;
  };
  for(let i=0;i<3;i++){ refresh(); const s=g.scrolls[side][i]; if(s.state!=="ready") continue;
    if(cdLeft(g,side,s.effect,gnow())>0||g.mana[side]<s.mana) continue;
    const t=wantTarget(s.effect); if(!t) continue;
    await useScroll(i,t[0],t[1],side,t[2]||null); await wait(700); }
  refresh(); const cost=g.rules.custoCristal; const free=g.scrolls[side].findIndex(s=>s.state!=="ready");
  if(free<0 || g.mana[side] < 3*cost+20 || Math.random()<(easy?.6:.25)) return;
  const pri=[]; if(g.pieces.some(p=>p.owner===side&&p.dead&&p.type!=="nucleo")) pri.push("ressuscitar");
  if(mine.some(p=>p.hp<p.maxHp*.6)) pri.push("curar"); if(threat) pri.push("estrutura","selamento");
  if(bestFieldEl()) pri.push("campo");
  if(mine.some(p=>p.type!=="nucleo"&&!p.element)) pri.push(pick(Object.keys(ELEMENTS)));
  pri.push("armadilha"); if(g.mana[side]<g.manaMax[side]*.5) pri.push("recMana");
  const eff = easy ? pick(pri) : pri[0]; const cb=activeCombos().find(c=>c.effect===eff); if(!cb) return;
  const ids=[cb.c1,cb.c2,cb.c3];
  await commit(g2=>{ const sc=g2.scrolls[side][free]; if(sc.state==="ready"||g2.mana[side]<3*cost) return false; g2.mana[side]-=3*cost;
    g2.scrolls[side][free]={state:"ready",c:ids,comboId:cb.id,effect:cb.effect,mana:cb.mana,cd:cb.cooldown};
    addLog(g2,`${g2.players[side].name} fundiu 3 cristais num pergaminho.`); });
  await wait(600);
}

/* ================= game: interaction ================= */
document.getElementById("board").addEventListener("click", e => {
  const cell=e.target.closest(".cell"); if(!cell||!G) return; const r=+cell.dataset.r, c=+cell.dataset.c, k=r+","+c; const g=V(), now=gnow();
  if(selScroll!=null && mySide){ const s=g.scrolls[mySide][selScroll];
    if(s.state==="ready" && !["none","field"].includes(EFFECTS[s.effect]?.target)){ const why=canUseScroll(g,s); const tg=effectTargets(g,s.effect,mySide);
      if(tg.has(k)){ if(why) return toast(why); useScroll(selScroll,r,c); return; } } }
  if(sel && isMyTurn()){ const p=g.pieces.find(x=>x.id===sel);
    if(p){ const mv=moveTargets(g,p); if(mv.has(k)) return doMove(sel,r,c); const at_=attackTargets(g,p,now).get(k); if(at_) return doAttack(sel,at_); } }
  const p=at(g,r,c), s=structAt(g,r,c);
  inspect = p ? {kind:"piece",id:p.id} : s ? {kind:"struct",id:s.id} : (g.spell&&g.spell.r===r&&g.spell.c===c) ? {kind:"spell"} : null;
  sel = p && !p.dead && p.owner===mySide ? p.id : null;
  renderBoard(); renderExplain();
});
document.getElementById("dice").addEventListener("click", e => {
  const b=e.target.closest("[data-die]"); if(!b||!G) return; const k=b.dataset.die;
  if(!isMyTurn()) return toast("Os dados só giram na sua vez.");
  if(G.dice[k].v!=null) return toast(G.dice[k].used?"Esse dado já foi usado neste turno.":"Esse dado já foi rolado. Use o resultado no tabuleiro.");
  if(!spinning[k]){ spinning[k]=true; renderDice(); return; }
  spinning[k]=false; const v=rnd6(), tn=G.turnNo;
  commit(g=>{ if(g.turnNo!==tn||g.dice[k].v!=null) return false; g.dice[k].v=v; addLog(g,`${g.players[mySide].name} tirou ${v} no dado ${{andar:"Andar",atacar:"Atacar",forca:"Força"}[k]}.`); });
});
document.getElementById("scrolls").addEventListener("click", e => {
  const b=e.target.closest("[data-scroll]"); if(!b||!G||!mySide) return; const i=+b.dataset.scroll;
  if(selScroll===i){ selScroll=null; pending=[]; } else { selScroll=i; pending=[]; sel=null; }
  renderScrolls(); renderBoard(); renderExplain(); renderCrystals();
});
document.getElementById("crystals").addEventListener("click", e => {
  if(e.target.closest("#histBtn")){ histOpen=!histOpen; renderCrystals(); return; }
  const b=e.target.closest("[data-cr]"); if(!b||!G) return;
  if(!isMyTurn()) return toast("Só dá para fundir cristais na sua vez.");
  if(selScroll==null) return toast("Primeiro clique em um pergaminho vazio.");
  const s=G.scrolls[mySide][selScroll]; if(s.state==="ready") return toast("Esse pergaminho já tem um efeito. Use-o ou escolha outro.");
  const cost=G.rules.custoCristal, mana=V().mana[mySide];
  if(mana < (pending.length+1)*cost) return toast("Mana insuficiente para mais um cristal.");
  pending.push(b.dataset.cr); Sfx.crystal(); renderScrolls(); renderExplain();
  if(pending.length===3){ const ids=[...pending], i=selScroll, cb=findCombo(ids); pending=[];
    setTimeout(()=>cb?Sfx.shine():Sfx.fail(),180);
    rememberTry(ids,cb);
    commit(g=>{ const sc=g.scrolls[mySide][i]; if(sc.state==="ready") return false; g.mana[mySide]-=3*cost;
      g.scrolls[mySide][i] = cb ? {state:"ready",c:ids,comboId:cb.id,effect:cb.effect,mana:cb.mana,cd:cb.cooldown} : {state:"fail",c:ids};
      if(cb && !g.found[mySide].includes(cb.id)) g.found[mySide].push(cb.id);
      addLog(g, cb?`${g.players[mySide].name} fundiu 3 cristais num pergaminho.`:`${g.players[mySide].name} fundiu 3 cristais, mas a combinação não existe.`); });
  }
});
document.getElementById("explain").addEventListener("click", e => {
  const b=e.target.closest("[data-field]"); if(!b||selScroll==null) return;
  const s=G.scrolls[mySide][selScroll]; const why=canUseScroll(V(),s); if(why) return toast(why);
  useScroll(selScroll,-1,-1,mySide,b.dataset.field);
});
/* últimas 10 combinações tentadas nesta série (guardadas na conta, neste aparelho) */
let histOpen=false;
function rememberTry(ids,cb){ if(!me||!G) return; const h=(me.hist ||= []); h.push({room:G.roomId,c:ids,effect:cb?cb.effect:null,t:Date.now()}); if(h.length>40) me.hist=h.slice(-40); save(); }

/* ================= game: render ================= */
/* só troca o HTML quando ele muda, para não perder toques no celular durante a atualização */
function setHTML(el,h){ if(el && el._h!==h){ el.innerHTML=h; el._h=h; } }
let fxSeen=null, fxDrop={};
function renderGame(){ if(!G) return; renderNetBanner(); $("#gTitle").textContent=G.title||"Duelo"; renderScore(); renderBoard(); renderCrystals(); renderCards(); renderDice(); renderScrolls(); renderExplain(); renderLog(); renderClock(); }
function renderScore(){ const S=G.series, el=$("#gScore"); el.hidden=false; const a=myTeam(), b=otherTeam(a);
  el.innerHTML=`<b class="num">${S.score[a]} x ${S.score[b]}</b> · duelo ${S.round}${G.mode==="2x2"?" · 2x2":""}`; }
function toView(dr,dc){ return myTeam()==="B" ? [dr,7-dc] : [7-dr,dc]; }
function plateFace(p){
  const im=IMGS[p.owner]||{}; let img=null;
  if(p.dead) img=im.tomb; else if(p.type==="nucleo") img=im.core; else img=(im.plates||[])[p.plate];
  if(img) return `<img class="pimg" alt="" src="${esc(img)}">`;
  if(p.dead) return icon("lapide");
  if(p.type==="nucleo") return icon("nucleo");
  return `<svg viewBox="0 0 40 40" fill="currentColor"><use href="#ico-placa"/></svg><span class="pnum">${p.plate+1}</span>`;
}
function renderBoard(){
  if(!G) return; const g=V(), now=gnow(); const B=$("#board");
  // novos efeitos (ataque, cura, pergaminho) vindos da última jogada
  let play=[];
  if(g.fx && g.fx.seq!==fxSeen){ fxSeen=g.fx.seq; play=g.fx.items||[]; fxDrop={}; for(const it of play) if(it.id&&it.prev!=null) fxDrop[it.id]={prev:it.prev,until:Date.now()+900}; }
  B.className = "board" + (g.field ? " field" : ""); B.style.setProperty("--field", g.field ? ELEMENTS[g.field.el].hex : "transparent");
  let mv=new Map(), atk=new Map(), tgt=new Set();
  if(sel && isMyTurn()){ const p=g.pieces.find(x=>x.id===sel); if(p&&!p.dead){ mv=moveTargets(g,p); atk=attackTargets(g,p,now); } }
  if(selScroll!=null && mySide){ const s=g.scrolls[mySide][selScroll]; if(s?.state==="ready") tgt=effectTargets(g,s.effect,mySide); }
  const cells=[];
  for(let dr=0;dr<8;dr++) for(let dc=0;dc<8;dc++){
    const [r,c]=toView(dr,dc), k=r+","+c, p=at(g,r,c), s=structAt(g,r,c), t=trapAt(g,r,c);
    const cls=["cell",(r+c)%2===0?"dk":""]; if(p&&p.id===sel) cls.push("sel"); if(mv.has(k)) cls.push("mv"); if(atk.has(k)) cls.push("atk"); if(tgt.has(k)) cls.push("tgt");
    let inner="", label="Casa vazia";
    if(t && t.owner===mySide) inner+=`<div class="trap" style="color:var(--${t.owner})">${icon("armadilha")}</div>`;
    if(g.spell && g.spell.r===r && g.spell.c===c){ inner+=`<div class="spell" title="Pergaminho de feitiço"><svg viewBox="0 0 170 100"><use href="#scrollbg"/></svg></div>`; label="Pergaminho de feitiço"; }
    if(p){ const pct=Math.max(0,p.hp/p.maxHp), showHp=!p.dead && (p.type!=="nucleo"||p.owner===mySide);
      const drop=fxDrop[p.id] && fxDrop[p.id].until>Date.now() ? fxDrop[p.id] : null;
      const tag = p.dead ? "" : (p.type==="nucleo" ? g.players[p.owner].name : pname(p));
      inner+=`<div class="pc ${p.owner} ${p.dead?"dead":""} ${p.type==="nucleo"?"core":"plate"}">${plateFace(p)}
        ${tag?`<span class="ptag">${esc(tag)}</span>`:""}
        ${showHp?`<div class="hp"><i class="${pct<.34?"low":pct<.67?"mid":""} ${drop?"drop":""}" style="width:${pct*100}%${drop?`;--from:${Math.min(1,drop.prev)*100}%`:""}"></i></div>`:""}
        ${p.element&&!p.dead?`<span class="el" style="background:${ELEMENTS[p.element].hex}" title="${ELEMENTS[p.element].name}"></span>`:""}
        ${p.sealHp>0?`<div class="seal"><span>selo ${p.sealHp}</span></div>`:""}
        ${!p.dead&&pieceCd(g,p,now)>0?`<span class="cd">${Math.ceil(pieceCd(g,p,now)/1000)}s</span>`:""}</div>`;
      label=`${p.dead?"Lápide de "+pname(p):(p.type==="nucleo"?"Núcleo de "+g.players[p.owner].name:pname(p))} ${p.owner===mySide?"sua":isEnemy(g,p.owner,mySide||"p1")?"inimiga":"do parceiro"}${showHp?`, vida ${p.hp}`:""}`; }
    if(s){ const pct=s.hp/s.maxHp; inner+=`<div class="pc ${s.owner}">${icon("estrutura")}<div class="hp"><i class="${pct<.34?"low":pct<.67?"mid":""}" style="width:${pct*100}%"></i></div></div>`; label=`Estrutura, vida ${s.hp}`; }
    cells.push(`<button class="${cls.join(" ")}" data-r="${r}" data-c="${c}" aria-label="${esc(label)}">${inner}</button>`);
  }
  if(B.children.length!==64 || !B._cells){ B.innerHTML=cells.join(""); B._cells=cells; }
  else cells.forEach((h,i)=>{ if(B._cells[i]!==h){ B.children[i].outerHTML=h; B._cells[i]=h; } });
  const F=$("#fieldTag"); if(F){ F.hidden=!g.field; if(g.field) F.innerHTML=`<i style="background:${ELEMENTS[g.field.el].hex}"></i>Campo de ${ELEMENTS[g.field.el].name}: +${g.rules.bonusCampo} de dano para placas de ${ELEMENTS[g.field.el].name}`; }
  if(play.length) playFx(play);
}
function cellEl(r,c){ return $(`#board .cell[data-r="${r}"][data-c="${c}"]`); }
function floatText(r,c,text,cls){
  const cell=cellEl(r,c), wrap=$(".boardwrap"); if(!cell||!wrap) return;
  const cr=cell.getBoundingClientRect(), wr=wrap.getBoundingClientRect(), d=document.createElement("div");
  d.className="floattxt "+cls; d.textContent=text; d.style.left=(cr.left-wr.left+cr.width/2)+"px"; d.style.top=(cr.top-wr.top+cr.height*.25)+"px";
  wrap.appendChild(d); setTimeout(()=>d.remove(),1300);
}
function flashCell(r,c,cls,ms=650){ const el=cellEl(r,c); if(!el) return; el.classList.add(cls); setTimeout(()=>cellEl(r,c)?.classList.remove(cls),ms); }
function playFx(items){
  for(const it of items){
    if(it.k==="hit"){ if(it.from) flashCell(it.from[0],it.from[1],"lunge",450); flashCell(it.to[0],it.to[1],"hit"); floatText(it.to[0],it.to[1],"−"+it.dmg,"dmg"); Sfx.hit(); }
    else if(it.k==="heal"){ flashCell(it.to[0],it.to[1],"healfx"); floatText(it.to[0],it.to[1],"+"+it.amt,"heal"); }
    else if(it.k==="pickup"){ flashCell(it.to[0],it.to[1],"healfx"); floatText(it.to[0],it.to[1],"pergaminho!","heal"); Sfx.pickup(); if(it.side===mySide) toast("Você ganhou um pergaminho pronto!"); }
    else if(it.k==="spell"){ flashCell(it.to[0],it.to[1],"healfx",900); Sfx.pickup(); toast("Um pergaminho de feitiço apareceu no centro!"); }
  }
}
function renderCrystals(){
  const can = isMyTurn() && selScroll!=null && G.scrolls[mySide]?.[selScroll]?.state!=="ready";
  const hist=(me?.hist||[]).filter(h=>h.room===G.roomId).slice(-10).reverse();
  setHTML($("#crystals"), `<div class="cgrid">${CRYSTALS.map(c=>`<button class="crystal" data-cr="${c.id}" title="${c.name}" aria-label="Cristal ${c.name}" ${can?"":"disabled"}>${gem(c.id)}</button>`).join("")}</div>
    <button id="histBtn" class="histbtn" aria-expanded="${histOpen}" title="Últimas combinações">${icon("hist")}<span>últimas</span></button>
    ${histOpen?`<div class="histpop"><span class="label">Suas últimas ${hist.length||""} combinações nesta série</span>${hist.length?hist.map(h=>`<div class="hrow">${gemsInline(h.c)}<span class="${h.effect?"ok":"zero"}">${h.effect?esc(EFFECTS[h.effect]?.name||h.effect):"resultado zero"}</span></div>`).join(""):`<p class="muted" style="margin:4px 0 0">Nenhuma tentativa ainda.</p>`}</div>`:""}`);
}
function renderCards(){
  if(!G) return; const g=V(); const mineT=myTeam();
  const order=[...g.order].sort((a,b)=>(g.team[a]===mineT?0:1)-(g.team[b]===mineT?0:1));
  setHTML($("#pcards"), order.map(side=>{ const pl=g.players[side], mine=side===mySide, partner=!mine&&!isEnemy(g,side,mySide||"p1");
    const core=g.pieces.find(p=>p.owner===side&&p.type==="nucleo"); const fr=!mine&&isFriendName(pl.name);
    const status = g.out[side] ? "fora" : (g.turn===side&&g.status==="playing" ? "jogando" : "");
    return `<div class="pcard ${g.turn===side&&g.status==="playing"?"turn":""} ${g.out[side]?"out":""}">
      <span class="side" style="background:var(--${side})"></span>
      <div style="min-width:0"><div class="nm">${esc(pl.name)}${mine?` <span class="chip">você</span>`:partner?` <span class="chip">parceiro</span>`:` <span class="chip">adversário</span>`}${!mine&&mySide&&!pl.ai&&g.net&&!fr?` <button class="btn sm ghost" data-addfriend="${esc(pl.name)}">${NET.sentFriend.has(keyOf(pl.name))?"Convite enviado":"+ Amigo"}</button>`:""}${fr?` <span class="chip">amigo</span>`:""}</div>
      ${mine?`<div class="meters">
        <div class="meter"><span class="label">Mana</span><div class="bar"><i class="mana" style="width:${g.mana[side]/g.manaMax[side]*100}%"></i></div><span>${g.mana[side]}/${g.manaMax[side]}</span></div>
        <div class="meter"><span class="label">Núcleo</span><div class="bar"><i class="life" style="width:${Math.max(0,core.hp)/core.maxHp*100}%"></i></div><span>${Math.max(0,core.hp)}/${core.maxHp}</span></div>
      </div>`:`<div class="muted" style="font-size:12px">Mana e núcleo ocultos</div>`}</div>
      <span class="label">${status}</span></div>`; }).join(""));
}
document.getElementById("pcards").addEventListener("click", e=>{ const b=e.target.closest("[data-addfriend]"); if(b) sendFriendReq(b.dataset.addfriend); });
function pips(v){ const on={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[v]||[]; return [...Array(9)].map((_,i)=>`<i class="${on.includes(i)?"on":""}"></i>`).join(""); }
function renderDice(){
  if(!G) return; const names={andar:"Andar",atacar:"Atacar",forca:"Força"};
  $("#dice").innerHTML = ["andar","atacar","forca"].map(k=>{ const d=G.dice[k]; const spin=spinning[k]&&d.v==null;
    const cls=["die",spin?"spin":"",d.used?"used":"",d.v!=null&&!d.used?"ready":""].join(" ");
    const hint = d.used?"usado": d.v!=null?"resultado "+d.v : spin?"clique para parar": isMyTurn()?"clique para girar":"";
    return `<button class="${cls}" data-die="${k}" aria-label="Dado ${names[k]}"><span class="label">${names[k]}</span><span class="face ${d.v==null?"q":""}">${d.v==null?(spin?"":"?"):pips(d.v)}</span><span class="hint">${hint}</span></button>`; }).join("");
}
function renderScrolls(){
  if(!G) return; const list = mySide ? G.scrolls[mySide] : [{state:"empty"},{state:"empty"},{state:"empty"}];
  $("#scrolls").innerHTML = list.map((s,i)=>{ let inner;
    if(selScroll===i && s.state!=="ready" && pending.length) inner=`${gemsInline(pending)}<span>${3-pending.length} cristal(is) a escolher</span>`;
    else if(s.state==="ready") inner=`${gemsInline(s.c)}<span>${esc(EFFECTS[s.effect]?.name||s.effect)}${s.free?" ✦":""}</span>`;
    else if(s.state==="fail") inner=`${gemsInline(s.c)}<span>Resultado zero</span>`;
    else inner=`<span>${selScroll===i?"Escolha 3 cristais":"Pergaminho vazio"}</span>`;
    return `<button class="scroll ${s.state}" data-scroll="${i}" aria-pressed="${selScroll===i}"><svg class="bg" viewBox="0 0 170 100"><use href="#scrollbg"/></svg><div class="in">${inner}</div></button>`; }).join("");
}
function kv(label,val){ return `<div><span class="label">${label}</span><br><b class="num">${val}</b></div>`; }
function foundList(g){
  const f=(g.found?.[mySide]||[]).map(id=>activeCombos().find(c=>c.id===id)).filter(Boolean); if(!f.length) return "";
  return `<div><span class="label">Combinações que você já descobriu nesta série</span><div style="display:grid;gap:4px;margin-top:4px">${f.map(c=>`<div style="display:flex;gap:6px;align-items:center;font-size:14px">${gemsInline([c.c1,c.c2,c.c3])} ${esc(EFFECTS[c.effect].name)}</div>`).join("")}</div></div>`;
}
function renderExplain(){
  if(!G) return; const g=V(), now=gnow(), X={set innerHTML(h){ setHTML($("#explain"),h); }};
  if(selScroll!=null && mySide){ const s=g.scrolls[mySide][selScroll];
    if(s.state==="ready"){ const E=EFFECTS[s.effect]; const why=canUseScroll(g,s); const left=cdLeft(g,mySide,s.effect,now);
      const action = why ? `<p style="margin:0"><b>${esc(why)}</b></p>`
        : E?.target==="none" ? `<div><button class="btn" id="exUse">Ativar efeito</button></div>`
        : E?.target==="field" ? `<div><span class="label">Escolha o elemento do campo</span><div class="fieldpick">${Object.entries(ELEMENTS).map(([k,e])=>`<button class="btn sm" data-field="${k}"><i style="background:${e.hex}"></i>${e.name}</button>`).join("")}</div></div>`
        : `<p style="margin:0"><b>Clique numa casa destacada em amarelo no tabuleiro.</b></p>`;
      X.innerHTML=`<span class="label">Explicação${s.free?" · pergaminho de feitiço":""}</span><h3>${esc(E?.name||s.effect)}</h3><p style="margin:0">${E?E.txt(g.rules):"Efeito desconhecido."}</p>
      <div class="kv">${kv("Consumo de mana",s.mana)}${kv("Intervalo",fmtS(s.cd||0))}${left>0?kv("Recarga restante",Math.ceil(left/1000)+"s"):""}</div>${action}`;
      const u=$("#exUse"); if(u) u.onclick=()=>useScroll(selScroll); return; }
    X.innerHTML=`<span class="label">Explicação</span><h3>Fundir cristais</h3><p style="margin:0">Clique em 3 cristais coloridos para fundi-los neste pergaminho. Cada cristal consome ${g.rules.custoCristal} de mana. As combinações foram sorteadas quando a sala foi criada; se a combinação não existir, o resultado é zero e a mana é perdida. O botão “últimas” mostra o que você já tentou.</p>
      ${s.state==="fail"?`<p style="margin:0"><b>A última fusão deste pergaminho não formou nenhum efeito.</b></p>`:""}${!isMyTurn()?`<p style="margin:0"><b>Aguarde a sua vez para fundir.</b></p>`:""}${foundList(g)}`; return; }
  if(inspect){
    if(inspect.kind==="spell" && g.spell){ X.innerHTML=`<span class="label">Explicação</span><h3>Pergaminho de feitiço</h3><p style="margin:0">Leve uma placa ou o seu núcleo até esta casa (passar por cima também vale). Você ganha um pergaminho com um efeito sorteado, já pronto, sem precisar combinar cristais.</p>`; return; }
    if(inspect.kind==="piece"){ const p=g.pieces.find(x=>x.id===inspect.id); if(p){ const st=p.st; const mine=p.owner===mySide; const cd=pieceCd(g,p,now);
      let tip=""; if(mine&&isMyTurn()&&!p.dead){ const A=g.dice.atacar,F=g.dice.forca,M=g.dice.andar;
        if(p.sealHp>0) tip="Selada: não anda. Ataque esta própria placa para quebrar o selo.";
        else if(M.v&&!M.used) tip=`Andar ${Math.min(M.v,st.andar)} casa(s): clique num ponto verde.`;
        if(p.type!=="nucleo"){
          if(A.v&&!A.used&&F.v&&!F.used){ tip+= cd>0?` Ataque recarregando (${Math.ceil(cd/1000)}s, só corre na vez do adversário).`:st.forca>0?` Ataque até ${Math.min(A.v,st.atq)} casa(s), ${Math.min(F.v,st.forca)} de força: clique num alvo vermelho.`:""; }
          else if(A.v&&!A.used&&!F.v) tip+=" Role o dado Força para poder atacar.";
          else if(F.v&&!F.used&&!A.v) tip+=" Role o dado Atacar para poder atacar."; } }
      const owner = mine?"sua":isEnemy(g,p.owner,mySide||"p1")?"do adversário "+g.players[p.owner].name:"do parceiro "+g.players[p.owner].name;
      const stats = p.type==="nucleo" ? `${kv("Vida",mine?p.hp+"/"+p.maxHp:"oculta")}${kv("Distância andar","resultado do dado")}`
        : `${kv("Vida",p.dead?0:p.hp+"/"+p.maxHp)}${kv("Força",st.forca)}${kv("Distância ataque",st.atq)}${kv("Distância andar",st.andar)}${kv("Intervalo",st.intervalo+"s")}${cd>0?kv("Recarga",Math.ceil(cd/1000)+"s"):""}${kv("Elemento",p.element?ELEMENTS[p.element].name:"—")}`;
      X.innerHTML=`<span class="label">Explicação · ${esc(owner)}</span><h3>${p.dead?"Lápide · ":""}${esc(pname(p))}</h3>
        <div class="kv">${stats}</div>${p.type==="nucleo"?`<p style="margin:0;font-size:14px">O núcleo anda quantas casas o dado Andar mandar, mas não ataca. Se ele chegar a zero, você sai do duelo.</p>`:""}${tip?`<p style="margin:0"><b>${tip}</b></p>`:""}`; return; } }
    else { const s=g.structures.find(x=>x.id===inspect.id); if(s){ X.innerHTML=`<span class="label">Explicação</span><h3>Estrutura</h3><div class="kv">${kv("Vida",s.hp+"/"+s.maxHp)}${kv("Dono",esc(g.players[s.owner].name))}</div><p style="margin:0">Bloqueia a passagem e os ataques. Para atingir o que está atrás, dê a volta ou destrua-a.</p>`; return; } }
  }
  const my=isMyTurn(), nextSpell=Math.max(0,Math.ceil((g.spellNext-now)/1000));
  X.innerHTML=`<span class="label">Explicação · duelo ${g.series.round} da série</span><h3>${g.status!=="playing"?"Duelo encerrado":my?"Sua vez":"Vez de "+esc(g.players[g.turn].name)}</h3>
    <p style="margin:0">${my?"Clique num dado para girá-lo e clique de novo para pará-lo. Depois escolha uma placa ou o seu núcleo: os pontos verdes mostram para onde anda e os quadros vermelhos o que a placa pode atacar (precisa dos dados Atacar e Força). Cada dado vale uma vez por turno.":"Enquanto espera, clique nas placas para ver os status delas."}</p>
    <p style="margin:0;font-size:14px">${g.spell?"Há um pergaminho de feitiço no tabuleiro: pise nele para ganhar um efeito pronto.":`Próximo pergaminho de feitiço em ${fmtS(nextSpell)}.`} Intervalos de placas e pergaminhos só correm na vez do adversário.</p>${foundList(g)}`;
}
function renderLog(){ const L=$("#log"); L.innerHTML=G.log.slice(-12).reverse().map(l=>`<div><b class="num">${new Date(l.t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b> ${esc(l.x)}</div>`).join(""); }
function renderClock(){
  if(!G) return; const pill=$("#gTurn"); const left=Math.max(0,Math.ceil((G.turnEndsAt-gnow())/1000));
  if(G.status!=="playing"){ pill.className="turnpill"; $("#gTurnTxt").textContent="Encerrado"; $("#gTimer").textContent=""; }
  else { const mine=G.turn===mySide; pill.className="turnpill"+(mine?" mine":"")+(left<=10?" low":""); $("#gTurnTxt").textContent=mine?"Sua vez":`Vez de ${G.players[G.turn].name}`; $("#gTimer").textContent=fmtS(left); }
  $("#gPass").disabled=!isMyTurn(); $("#gQuit").disabled=G.status!=="playing"||!mySide||!!G.out?.[mySide];
}
