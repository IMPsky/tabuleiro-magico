/* ================= constants ================= */
const CRYSTALS = [
  {id:"vermelho",name:"Vermelho",hex:"#e3262b"},{id:"celeste",name:"Celeste",hex:"#4fb6ea"},
  {id:"preto",name:"Preto",hex:"#14161c"},{id:"petroleo",name:"Petróleo",hex:"#1e6385"},
  {id:"laranja",name:"Laranja",hex:"#f07a2e"},{id:"roxo",name:"Roxo",hex:"#a03db2"},
  {id:"verde",name:"Verde",hex:"#3aa33a"},{id:"prata",name:"Prata",hex:"#d3d7da"},
  {id:"amarelo",name:"Amarelo",hex:"#f5e417"},{id:"marinho",name:"Marinho",hex:"#16246b"},
  {id:"carmesim",name:"Carmesim",hex:"#b0101e"},{id:"violeta",name:"Violeta",hex:"#7041b5"},
  {id:"branco",name:"Branco",hex:"#fbfbfb"},{id:"pessego",name:"Pêssego",hex:"#f6c4ab"},
  {id:"marrom",name:"Marrom",hex:"#7c3c15"},{id:"menta",name:"Menta",hex:"#c6edc9"}
];
const CR = Object.fromEntries(CRYSTALS.map(c=>[c.id,c]));
const ELEMENTS = {
  agua:{name:"Água",strong:["fogo"],hex:"#2f8ff0",emoji:"💧"}, raio:{name:"Raio",strong:["agua","gelo"],hex:"#f5d90a",emoji:"⚡"},
  fogo:{name:"Fogo",strong:["planta","gelo"],hex:"#f0531e",emoji:"🔥"}, gelo:{name:"Gelo",strong:["planta","agua"],hex:"#9fe4ff",emoji:"❄️"},
  terra:{name:"Terra",strong:["fogo","gelo","vento"],hex:"#8a5a2b",emoji:"⛰️"}, planta:{name:"Planta",strong:["agua","terra"],hex:"#37b24d",emoji:"🌿"},
  vento:{name:"Vento",strong:["fogo","planta"],hex:"#c9f2e4",emoji:"🌪️"}, luz:{name:"Luz",strong:["trevas"],hex:"#fff6c2",emoji:"✨"},
  trevas:{name:"Trevas",strong:["luz"],hex:"#3b2357",emoji:"🌑"}
};

/* Regras fixas: iguais para todos os duelistas. */
const RULES = {
  manaBase:200, nucleoVidaBase:100, nucleoAndar:6, feiticoMin:5, manaPorTurno:5, custoCristal:1,
  bonusElemento:2, bonusVantagem:2, bonusCampo:2, curaValor:6,
  armadilhaDano:4, armadilhaDuracao:300, estruturaVida:15, seloVida:4,
  recManaQtd:2, recManaSeg:60, recVidaQtd:3, recVidaSeg:2, recVidaDur:120,
  necroVida:2, necroMin:5, arvoreCura:6, arvoreCadaMin:4, arvoreMin:10,
  pontosArsenal:40, vitoriasSerie:2
};

/* ---- placas de pedra (Arsenal) ---- */
const ATTRS = [
  {k:"vida",     label:"Vida",              base:4,  step:2,  maxP:13, unit:""},
  {k:"forca",    label:"Força",             base:1,  step:1,  maxP:5,  unit:""},
  {k:"atq",      label:"Distância ataque",  base:1,  step:1,  maxP:5,  unit:""},
  {k:"andar",    label:"Distância andar",   base:1,  step:1,  maxP:5,  unit:""},
  {k:"intervalo",label:"Intervalo",         base:30, step:-5, maxP:6,  unit:"s"}
];
const MAX_PLATES = 8;
/* posições no tabuleiro (linha a partir do seu lado, coluna); o núcleo fica na coluna 4 da primeira linha */
const SLOTS = [[0,2],[0,6],[1,1],[1,2],[1,3],[1,4],[1,5],[1,6]];
const CORE_POS = [0,4];
const plateStats = pl => Object.fromEntries(ATTRS.map(a=>[a.k, a.base + a.step*(pl.p?.[a.k]||0)]));
const platePoints = pl => ATTRS.reduce((s,a)=>s+(pl.p?.[a.k]||0),0);
const arsenalPoints = ars => ars.filter(x=>x.on).reduce((s,x)=>s+platePoints(x),0);
const emptyP = () => Object.fromEntries(ATTRS.map(a=>[a.k,0]));
function defaultArsenal(){
  const mk=(on,p)=>({name:"",img:null,on,p:{...emptyP(),...p}});
  return [
    mk(true,{vida:2,forca:3,atq:3,intervalo:2}), mk(true,{vida:2,forca:3,atq:3,intervalo:2}),
    mk(true,{vida:2,forca:2,andar:1}), mk(true,{vida:2,forca:2,andar:1}), mk(true,{vida:2,forca:2,andar:1}), mk(true,{vida:2,forca:2,andar:1}),
    mk(false,{}), mk(false,{})
  ];
}
/* versão enviada ao oponente: só placas em campo, sem imagem, com pontos limitados às regras */
function publicArsenal(ars){ return ars.filter(x=>x.on).slice(0,MAX_PLATES).map(x=>({name:String(x.name||"").slice(0,20),p:{...x.p}})); }
function sanitizeArsenal(list){
  let out=(Array.isArray(list)?list:[]).slice(0,MAX_PLATES).map(x=>({name:String(x?.name||"").slice(0,20),p:Object.fromEntries(ATTRS.map(a=>[a.k,Math.max(0,Math.min(a.maxP,Math.floor(+x?.p?.[a.k]||0)))]))}));
  if(!out.length) out=publicArsenal(defaultArsenal());
  let total=out.reduce((s,x)=>s+platePoints(x),0);
  for(let i=out.length-1;i>=0&&total>RULES.pontosArsenal;i--) for(const a of ATTRS){ while(out[i].p[a.k]>0&&total>RULES.pontosArsenal){ out[i].p[a.k]--; total--; } }
  return out;
}
function randomArsenal(){
  const n=5+Math.floor(Math.random()*3), out=[]; for(let i=0;i<n;i++) out.push({name:"",p:emptyP()});
  let left=RULES.pontosArsenal, guard=0;
  while(left>0 && guard++<500){ const pl=out[Math.floor(Math.random()*n)], a=ATTRS[Math.floor(Math.random()*ATTRS.length)];
    if(pl.p[a.k]<a.maxP){ pl.p[a.k]++; left--; } }
  return out;
}
/* ---- times e posições (1x1 e 2x2) ---- */
const TEAM = {p1:"A",p2:"B",p3:"A",p4:"B"};
const SIDES = {"1x1":["p1","p2"],"2x2":["p1","p2","p3","p4"]};
const MAX_PLATES_2X2 = 7;
function layoutFor(mode, side){
  if(mode!=="2x2"){ const row=r=>side==="p1"?r:7-r; return {core:[row(CORE_POS[0]),CORE_POS[1]], slots:SLOTS.map(([r,c])=>[row(r),c])}; }
  const left = side==="p1"||side==="p4", row=r=>TEAM[side]==="A"?r:7-r, mir=([r,c])=>[r,7-c];
  const L={core:[0,1],slots:[[0,0],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3]]};
  const B = left ? L : {core:mir(L.core),slots:L.slots.map(mir)};
  return {core:[row(B.core[0]),B.core[1]], slots:B.slots.map(([r,c])=>[row(r),c])};
}
const pname = p => p.type==="nucleo" ? "Núcleo Mágico" : (p.name || `Placa ${p.plate+1}`);
const TARGET_TXT = {anyTomb:"qualquer lápide", emptyAny:"qualquer casa vazia", ownPiece:"uma placa sua", ownTomb:"uma lápide sua", emptyNearOwn:"uma casa vazia perto das suas placas", enemyNearOwn:"uma placa inimiga perto das suas", none:"ativa na hora", field:"o tabuleiro inteiro"};

/* ---- efeitos dos pergaminhos ---- */
const EFFECTS = {
  curar:{name:"Curar",target:"ownPiece",core:true,txt:r=>`Recupera ${r.curaValor} de vida de uma placa sua (o núcleo também). Clique no pergaminho e depois na placa.`},
  ressuscitar:{name:"Ressuscitar",target:"ownTomb",txt:()=>`Revive uma placa sua que virou lápide, com a vida cheia. Clique no pergaminho e depois na lápide.`},
  armadilha:{name:"Armadilha",target:"emptyNearOwn",txt:r=>`Arma uma armadilha numa casa vazia ao redor de uma placa sua. A placa inimiga que pisar nela sofre ${r.armadilhaDano} de dano. Dura ${Math.round(r.armadilhaDuracao/60*10)/10} min e só você a vê.`},
  estrutura:{name:"Estrutura",target:"emptyNearOwn",txt:r=>`Ergue uma estrutura com ${r.estruturaVida} de vida numa casa vazia ao redor de uma placa sua. Ninguém atravessa e ela bloqueia ataques que passem por ela: o inimigo precisa dar a volta ou destruí-la.`},
  selamento:{name:"Selamento",target:"enemyNearOwn",txt:r=>`Sela uma placa inimiga vizinha a uma placa sua: ela não anda até o selo (${r.seloVida} de vida) ser quebrado. O dono quebra o selo atacando a própria placa selada.`},
  recMana:{name:"Recuperação de mana",target:"none",txt:r=>`Recupera ${r.recManaQtd} de mana a cada 1 segundo durante ${r.recManaSeg} segundos.`},
  recVida:{name:"Recuperação de vida",target:"none",txt:r=>`Seu núcleo recupera ${r.recVidaQtd} de vida a cada ${r.recVidaSeg} segundos, durante ${r.recVidaDur/60} minutos.`},
  necromancia:{name:"Necromancia",target:"anyTomb",emoji:"💀",txt:r=>`Revive qualquer lápide, sua ou do inimigo, para lutar do seu lado. A placa volta com só ${r.necroVida} de vida e dura ${r.necroMin} minutos; depois cai e vira lápide de novo.`},
  arvore:{name:"Árvore da vida",target:"emptyAny",emoji:"🌳",txt:r=>`Planta uma árvore numa casa vazia. Todas as placas nas casas ao redor dela recuperam ${r.arvoreCura} de vida a cada ${r.arvoreCadaMin} minutos. A árvore dura ${r.arvoreMin} minutos e ninguém atravessa a casa dela.`},
  campo:{name:"Campo elemental",target:"field",emoji:"🌀",txt:r=>`Transforma o chão do tabuleiro no terreno de um elemento que você escolhe (lava, água, gelo...). Enquanto o campo durar, toda placa com o mesmo elemento do campo causa +${r.bonusCampo} de dano, de qualquer duelista. Dura até alguém criar outro campo ou o duelo acabar.`}
};
for (const [k,e] of Object.entries(ELEMENTS)) {
  EFFECTS[k] = {name:"Elemento "+e.name,target:"ownPiece",element:k,emoji:e.emoji,
    txt:r=>`Dá o elemento ${e.emoji} ${e.name} a uma placa sua: +${r.bonusElemento} de dano em qualquer placa e mais +${r.bonusVantagem} contra placas de ${e.strong.map(s=>ELEMENTS[s].name).join(", ")}.`};
}
/* faixas usadas no sorteio das combinações: [mana mínima, mana máxima, intervalos possíveis em segundos] */
const EFFECT_COST = {
  curar:[6,10,[20,30,45]], ressuscitar:[16,24,[60,90,120]], armadilha:[8,12,[30,45,60]], estrutura:[8,12,[30,45,60]],
  selamento:[10,14,[45,60,90]], recMana:[4,8,[90,120]], recVida:[6,10,[90,120]], campo:[10,16,[45,60,90]],
  necromancia:[14,20,[60,90,120]], arvore:[12,18,[90,120]]
};
function genCombos(){
  const used=new Set(), out=[];
  for(const eff of Object.keys(EFFECTS)){
    let c; do { c=[0,1,2].map(()=>CRYSTALS[Math.floor(Math.random()*CRYSTALS.length)].id); } while(used.has([...c].sort().join("|")));
    used.add([...c].sort().join("|"));
    const [lo,hi,cds]=EFFECT_COST[eff]||[5,8,[20,30,45]];
    out.push({id:eff,c1:c[0],c2:c[1],c3:c[2],effect:eff,mana:lo+Math.floor(Math.random()*(hi-lo+1)),cooldown:cds[Math.floor(Math.random()*cds.length)]});
  }
  return out;
}

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const keyOf = name => String(name||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const validName = n => /^[A-Za-zÀ-ÿ0-9_.\-]{3,16}$/.test(n) && /^[a-z0-9_.\-]{3,16}$/.test(keyOf(n)) && !/^\.+$/.test(keyOf(n));
const rnd6 = () => { const a=new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % 6); };
const uidStr = () => Math.random().toString(36).slice(2,10);
const cheb = (a,b,c,d) => Math.max(Math.abs(a-c),Math.abs(b-d));
const other = s => s==="p1"?"p2":"p1";
const fmtS = s => s>=60 ? `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}` : `${s}s`;
let toastT; function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3600);}
const b64e = a => btoa(String.fromCharCode(...a));
const b64d = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function pbkdf2(pass,salt){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pass),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:b64d(salt),iterations:120000,hash:"SHA-256"},k,256);return b64e(new Uint8Array(bits));}
async function sha(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");}
const newSalt = () => b64e(crypto.getRandomValues(new Uint8Array(16)));
const icon = (t,extra="") => `<svg viewBox="0 0 40 40" fill="currentColor" ${extra}><use href="#ico-${t}"/></svg>`;
const gem = id => `<svg viewBox="0 0 20 20" class="gem" style="color:${CR[id]?.hex||"#555"}" fill="currentColor"><use href="#gem"/></svg>`;
const gemsInline = ids => `<span class="gems-inline">${(ids||[]).map(gem).join("")}</span>`;
function avatarHtml(acc,cls=""){ if(acc?.avatar) return `<div class="avatar ${cls}"><img alt="" src="${esc(acc.avatar)}"></div>`; return `<div class="avatar ${cls}">${esc((acc?.name||"?")[0].toUpperCase())}</div>`; }
function shrinkImage(file,size=112){ return new Promise((res,rej)=>{ const img=new Image(), url=URL.createObjectURL(file);
  img.onload=()=>{ const c=document.createElement("canvas"); c.width=c.height=size; const x=c.getContext("2d"), s=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,size,size); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg",.8)); };
  img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("Esse arquivo não é uma imagem válida.")); }; img.src=url; }); }
