/* ================= state ================= */
let RULES = clone(DEFAULT_RULES), COMBOS = [];
let me = null, view = "home", adminTab = "combos";
let editingCombo = null, comboDraft = {c:[null,null,null],effect:"curar",mana:8,cd:30};
let aiGame=null, aiRunning=false, gameUnsub=null;
let G=null, gameId=null, mySide=null, sel=null, inspect=null, selScroll=null, pending=[], spinning={}, busy=false;
const timeoutSent = {}; let lastFlash=null, finishedHandled={};
const gnow = () => Date.now() + (NET.offset||0);

/* ================= storage (no aparelho) ================= */
const Pref = window.Capacitor?.isNativePlatform?.() ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Preferences") : window.Capacitor.Plugins.Preferences) : null;
const STORE_KEY = "tm.store" + (window.Capacitor?.isNativePlatform?.() ? "" : (location.hash||"")); // no navegador, #a/#b simulam aparelhos diferentes
let STORE = {accounts:{}, combos:null, rules:null, friends:{}, invites:{}, session:null, v:1};
async function loadStore(){
  try{ const raw = Pref ? (await Pref.get({key:STORE_KEY})).value : localStorage.getItem(STORE_KEY); if(raw) STORE = Object.assign(STORE, JSON.parse(raw)); }catch(e){}
  if(!STORE.combos) STORE.combos = clone(DEFAULT_COMBOS);
  COMBOS = STORE.combos; RULES = mergeRules(STORE.rules);
}
let saveT=null;
function save(now){ clearTimeout(saveT); const run=async()=>{ const raw=JSON.stringify(STORE); try{ if(Pref) await Pref.set({key:STORE_KEY,value:raw}); else localStorage.setItem(STORE_KEY,raw); }catch(e){ toast("Não foi possível salvar no aparelho."); } }; if(now) return run(); saveT=setTimeout(run,200); }
function mergeRules(src){ const r=clone(DEFAULT_RULES); if(!src) return r; for(const k of Object.keys(r)){ if(k==="pecas"){ for(const p of Object.keys(r.pecas)) Object.assign(r.pecas[p], src.pecas?.[p]||{}); } else if(typeof src[k]==="number") r[k]=src[k]; } return r; }
const myFriends = () => (STORE.friends[me.key] ||= []);
const myInvites = () => (STORE.invites[me.key] ||= []);
const isFriendName = n => myFriends().some(f=>keyOf(f.name)===keyOf(n));

/* ================= screens ================= */
function showScreen(id){ for(const s of ["login","lobby","game"]) $("#scr-"+s).hidden = s!==id; window.scrollTo(0,0); }
$("#armyL").innerHTML = ["torreElemental","peao","torreDisparo","peao"].map(t=>icon(t)).join("");
$("#armyR").innerHTML = ["peao","torreDisparo","peao","catapulta"].map(t=>icon(t)).join("");
function modal(html){ $("#modalCard").innerHTML=html; $("#modal").hidden=false; }
function closeModal(){ $("#modal").hidden=true; }
const newCode = () => { const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789", a=new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(x=>A[x%A.length]).join(""); };

/* ================= auth (contas locais) ================= */
let signup=false;
$("#lgToggle").onclick = () => { signup=!signup; $("#lgPass2Wrap").hidden=!signup; $("#lgSubmit").textContent=signup?"CRIAR CONTA":"LOGIN"; $("#lgToggle").textContent=signup?"Já tenho conta":"Cadastre-se"; $("#loginMode").textContent=signup?"Crie um nome e uma senha. Fica salvo neste aparelho.":"Entre com seu nome de duelista"; $("#lgErr").textContent=""; $("#lgPass").autocomplete=signup?"new-password":"current-password"; };
$("#lgForgot").onclick = () => { $("#loginForm").hidden=true; $("#forgotForm").hidden=false; $("#fgName").value=$("#lgName").value; $("#fgErr").textContent=""; };
$("#fgBack").onclick = () => { $("#loginForm").hidden=false; $("#forgotForm").hidden=true; };
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); const err=$("#lgErr"); err.textContent="";
  const name=$("#lgName").value.trim(), pass=$("#lgPass").value, key=keyOf(name);
  if(!validName(name)){ err.textContent="Use de 3 a 16 letras, números, ponto, hífen ou _."; return; }
  if(pass.length<4){ err.textContent="A senha precisa ter pelo menos 4 caracteres."; return; }
  const btn=$("#lgSubmit"); btn.disabled=true;
  try{
    if(signup){
      if(pass!==$("#lgPass2").value){ err.textContent="As senhas não conferem."; return; }
      if(STORE.accounts[key]){ err.textContent="Esse nome já existe neste aparelho. Escolha outro."; return; }
      const salt=newSalt(), hash=await pbkdf2(pass,salt), code=newCode(), rsalt=newSalt();
      const first = Object.keys(STORE.accounts).length===0;
      STORE.accounts[key]={key,name,salt,hash,rsalt,rhash:await pbkdf2(code,rsalt),avatar:null,wins:0,losses:0,isAdmin:first,createdAt:Date.now()};
      await save(true);
      modal(`<h2>Conta criada</h2><p>Guarde este código. Ele troca sua senha se você esquecer.</p><p style="font-family:var(--display);font-size:30px;letter-spacing:.15em;color:var(--gold2);margin:0">${code}</p>${first?`<p class="muted" style="font-size:13px">Esta é a primeira conta do aparelho, então ela é a administradora: só ela vê a página de Administração.</p>`:""}<button class="btn primary" id="mdOk">Anotei, entrar</button>`);
      $("#mdOk").onclick=()=>{ closeModal(); enter(STORE.accounts[key]); };
    } else {
      const acc=STORE.accounts[key];
      if(!acc || await pbkdf2(pass,acc.salt)!==acc.hash){ err.textContent="Nome ou senha incorretos."; return; }
      enter(acc);
    }
  } finally { btn.disabled=false; }
};
$("#forgotForm").onsubmit = async e => {
  e.preventDefault(); const err=$("#fgErr"); err.className="err"; err.textContent="";
  const acc=STORE.accounts[keyOf($("#fgName").value)], code=$("#fgCode").value.trim().toUpperCase(), np=$("#fgPass").value;
  if(np.length<4){ err.textContent="A nova senha precisa ter pelo menos 4 caracteres."; return; }
  if(!acc || !acc.rhash || await pbkdf2(code,acc.rsalt)!==acc.rhash){ err.textContent="Nome ou código de recuperação incorretos."; return; }
  acc.salt=newSalt(); acc.hash=await pbkdf2(np,acc.salt); await save(true);
  err.className="okmsg"; err.textContent="Senha trocada. Volte ao login e entre com a nova senha.";
};
function enter(acc){
  me=acc; STORE.session=acc.key; save();
  $("#navAdmin").hidden=!acc.isAdmin; showScreen("lobby"); renderProfile(); renderInvitesBadge(); go("home");
}
function logout(){ netClose(); me=null; G=null; aiGame=null; STORE.session=null; save(); if(signup) $("#lgToggle").click(); showScreen("login"); $("#lgPass").value=""; $("#lgPass2").value=""; $("#lgErr").textContent=""; }
$("#logout").onclick = () => logout();

/* ================= lobby ================= */
document.getElementById("nav").onclick = e => { const b=e.target.closest("[data-nav]"); if(b) go(b.dataset.nav); };
function go(v){ view=v; for(const b of document.querySelectorAll("[data-nav]")) b.setAttribute("aria-current", b.dataset.nav===v?"true":"false"); renderPanel(); }
function renderInvitesBadge(){ if(!me) return; const n=myInvites().length; $("#friendBadge").hidden=!n; $("#friendBadge").textContent=n; }
function renderProfile(){
  if(!me) return;
  $("#profileCard").innerHTML = `
    <div class="who">${avatarHtml(me)}<div style="min-width:0"><div class="label">Duelista</div><h2 style="font-size:22px;overflow-wrap:anywhere">${esc(me.name)}</h2></div></div>
    <div class="statlist">
      <div class="stat"><span class="label">Mana</span><b class="num">${RULES.manaBase}</b></div>
      <div class="stat"><span class="label">Vida do núcleo</span><b class="num">${RULES.nucleoVidaBase}</b></div>
      <div class="stat"><span class="label">Vitórias</span><b class="num">${me.wins||0}</b></div>
      <div class="stat"><span class="label">Derrotas</span><b class="num">${me.losses||0}</b></div>
    </div>
    <button class="btn primary" data-go="play">Jogar</button>
    <button class="btn" data-go="friends">Lista de amigos</button>`;
}
$("#profileCard").onclick = e => { const b=e.target.closest("[data-go]"); if(b) go(b.dataset.go); };

function resumeBanner(){
  let h="";
  if(G && G.net && G.status==="playing" && $("#scr-game").hidden) h+=`<div class="banner"><div class="grow"><b>Duelo em andamento</b> contra ${esc(G.players[other(mySide)].name)}.</div><button class="btn gold sm" data-act="resumeNet">Voltar ao duelo</button></div>`;
  if(aiGame && aiGame.status==="playing") h+=`<div class="banner"><div class="grow"><b>Duelo contra a IA em andamento.</b></div><button class="btn gold sm" data-act="resumeAi">Voltar ao duelo</button></div>`;
  return h;
}
function renderPanel(){
  if(!me) return; const P=$("#panel"); const resume=resumeBanner();
  if(view==="home"){
    const p=RULES.pecas;
    P.innerHTML = resume + `<div class="card"><div class="panel-head"><h2>As peças</h2><button class="btn primary" data-go="play">Jogar</button></div>
      <p class="muted" style="max-width:65ch;margin-top:0">Cada turno você tem três dados: <b>Andar</b> (quantas casas uma peça anda), <b>Atacar</b> (até onde o ataque alcança) e <b>Força</b> (quanto dano causa). O resultado nunca passa do limite da peça. Vence quem zerar o Núcleo Mágico do oponente. Todos os duelistas começam com os mesmos status.</p>
      <div class="pieces-guide">
      ${Object.keys(PIECES).map(t=>`<div class="pg">${icon(t)}<div class="nm">${PIECES[t]}</div><div class="st num">${t==="nucleo"?`Vida ${RULES.nucleoVidaBase} · não se move`:`Vida ${p[t].vida} · Força ${p[t].forca}<br>Ataque ${p[t].atq} · Andar ${p[t].andar}<br>Intervalo ${p[t].intervalo}s`}</div></div>`).join("")}
      <div class="pg">${icon("estrutura")}<div class="nm">Estrutura</div><div class="st">Vida ${RULES.estruturaVida} · bloqueia passagem e tiros</div></div>
      <div class="pg">${icon("armadilha")}<div class="nm">Armadilha</div><div class="st">${RULES.armadilhaDano} de dano · ${Math.round(RULES.armadilhaDuracao/60)} min</div></div>
      <div class="pg">${icon("lapide")}<div class="nm">Lápide</div><div class="st">Peça derrotada · pode ser ressuscitada</div></div>
      </div></div>`;
  }
  else if(view==="play"){
    const lastIp = STORE.lastIp || "";
    P.innerHTML = resume + `<div class="card" style="display:grid;gap:18px">
      <div class="panel-head" style="margin:0"><h2>Jogar</h2></div>
      <section style="display:grid;gap:10px"><h3 style="font-size:18px">Criar sala</h3>
        <form class="form-inline" id="newRoom">
          <div class="field"><label class="label" for="nrTitle">Título da sala</label><input id="nrTitle" maxlength="40" placeholder="Duelo dos magos" value="${esc(STORE.lastTitle||"")}" required></div>
          <div class="field" style="max-width:160px"><label class="label" for="nrPass">Senha (opcional)</label><input id="nrPass" type="password" maxlength="20" autocomplete="off"></div>
          <div class="field" style="max-width:150px"><label class="label" for="nrTurn">Tempo por turno</label><select id="nrTurn">${[30,60,90,120,180].map(s=>`<option value="${s}" ${s===(STORE.lastTurn||60)?"selected":""}>${fmtS(s)}</option>`).join("")}</select></div>
        </form>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="host" data-via="tcp">Criar sala no Wi-Fi (IP)</button><button class="btn" data-act="host" data-via="bt">Criar sala por Bluetooth</button></div>
      </section>
      <section style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:16px"><h3 style="font-size:18px">Entrar numa sala</h3>
        <form class="form-inline" id="joinIp"><div class="field"><label class="label" for="jIp">IP da sala</label><input id="jIp" inputmode="decimal" placeholder="192.168.0.12" value="${esc(lastIp)}" required></div><button class="btn primary" type="submit">Entrar pelo IP</button></form>
        <p class="muted" style="margin:0;font-size:13px">Os dois aparelhos precisam estar no mesmo Wi-Fi (ou um usando o roteador/hotspot do outro).</p>
        <div><button class="btn" data-act="btFind">Procurar sala por Bluetooth</button></div>
        <div class="list" id="btList"></div>
      </section>
      <section style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:16px"><h3 style="font-size:18px">Treinar contra a IA</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="ai" data-level="facil">IA fácil</button><button class="btn gold" data-act="ai" data-level="normal">IA normal</button></div>
      </section></div>`;
    $("#joinIp").onsubmit = e => { e.preventDefault(); joinByIp($("#jIp").value.trim()); };
    renderBtList();
  }
  else if(view==="friends"){
    const fr=myFriends(), inv=myInvites();
    P.innerHTML = resume + `<div class="card"><div class="panel-head"><h2>Lista de amigos</h2></div>
      <p class="muted" style="margin-top:0;max-width:65ch">Durante um duelo ou na sala de espera, toque em “+ Adicionar amigo” no nome do oponente para enviar um convite. Os convites recebidos aparecem aqui e no próprio duelo.</p>
      ${inv.length?`<h3 class="label" style="margin:10px 0 8px">Convites recebidos</h3><div class="list">${inv.map((v,i)=>`<div class="row"><div class="grow title">${esc(v.name)}</div><button class="btn sm primary" data-act="invOk" data-i="${i}">Aceitar</button><button class="btn sm danger" data-act="invNo" data-i="${i}">Recusar</button></div>`).join("")}</div>`:""}
      <h3 class="label" style="margin:16px 0 8px">Amigos</h3>
      <div class="list">${fr.map((f,i)=>`<div class="row"><div class="grow"><span class="title">${esc(f.name)}</span><div class="muted" style="font-size:13px">${[f.ip?`IP ${esc(f.ip)}`:"",f.btName||f.bt?`Bluetooth ${esc(f.btName||f.bt)}`:""].filter(Boolean).join(" · ")||"sem conexão salva"}</div></div>
        ${f.ip?`<button class="btn sm" data-act="fIp" data-i="${i}">Entrar pelo IP</button>`:""}${f.bt?`<button class="btn sm" data-act="fBt" data-i="${i}">Entrar por Bluetooth</button>`:""}
        <button class="btn sm ghost" data-act="fDel" data-i="${i}">Remover</button></div>`).join("") || `<div class="empty">Você ainda não tem amigos salvos neste aparelho.</div>`}</div></div>`;
  }
  else if(view==="profile"){
    P.innerHTML = `<div class="card" style="display:grid;gap:22px"><div class="panel-head" style="margin:0"><h2>Perfil</h2></div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${avatarHtml(me)}<div class="field"><label class="label" for="avFile">Foto de perfil</label><input id="avFile" type="file" accept="image/*"></div>${me.avatar?`<button class="btn sm ghost" data-act="rmAvatar">Remover foto</button>`:""}</div>
      <form class="form-inline" id="pwF"><div class="field"><label class="label" for="pwOld">Senha atual</label><input id="pwOld" type="password" autocomplete="current-password" required></div><div class="field"><label class="label" for="pwNew">Nova senha</label><input id="pwNew" type="password" autocomplete="new-password" required></div><button class="btn" type="submit">Trocar senha</button></form>
      <div class="form-inline"><div style="flex:1;min-width:200px"><div class="label">Código de recuperação</div><p class="muted" style="margin:4px 0 0;font-size:13px">Gere um novo se perdeu o antigo. O código anterior deixa de valer.</p></div><button class="btn" data-act="newCode">Gerar novo código</button></div>
      <div id="pfMsg" class="okmsg"></div></div>`;
    $("#avFile").onchange = e => setAvatar(e.target.files[0]);
    $("#pwF").onsubmit = async e => { e.preventDefault(); const o=$("#pwOld").value, n=$("#pwNew").value; if(n.length<4){toast("A nova senha precisa de 4 caracteres ou mais.");return;}
      if(await pbkdf2(o,me.salt)!==me.hash){ toast("Senha atual incorreta."); return; }
      me.salt=newSalt(); me.hash=await pbkdf2(n,me.salt); await save(true); $("#pfMsg").textContent="Senha alterada."; e.target.reset(); };
  }
  else if(view==="admin"){ renderAdmin(); }
}
document.getElementById("panel").addEventListener("click", async e => {
  const g=e.target.closest("[data-go]"); if(g) return go(g.dataset.go);
  const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act, i=+b.dataset.i;
  if(a==="resumeAi") openLocal(aiGame);
  else if(a==="resumeNet"){ showScreen("game"); renderGame(); }
  else if(a==="ai") startAiGame(b.dataset.level);
  else if(a==="host") hostRoom(b.dataset.via);
  else if(a==="btFind") btFind();
  else if(a==="btJoin") joinByBt(b.dataset.addr, b.dataset.name);
  else if(a==="invOk"){ const v=myInvites().splice(i,1)[0]; addFriendLocal(v); save(); renderInvitesBadge(); renderPanel(); toast(`${v.name} agora é seu amigo.`); if(NET.connected) netSend({t:"friendOk",name:me.name}); }
  else if(a==="invNo"){ myInvites().splice(i,1); save(); renderInvitesBadge(); renderPanel(); }
  else if(a==="fIp") joinByIp(myFriends()[i].ip);
  else if(a==="fBt") joinByBt(myFriends()[i].bt, myFriends()[i].btName);
  else if(a==="fDel"){ myFriends().splice(i,1); save(); renderPanel(); }
  else if(a==="rmAvatar"){ me.avatar=null; save(); renderProfile(); renderPanel(); }
  else if(a==="newCode"){ const code=newCode(); me.rsalt=newSalt(); me.rhash=await pbkdf2(code,me.rsalt); await save(true); modal(`<h2>Novo código</h2><p>Guarde este código de recuperação:</p><p style="font-family:var(--display);font-size:30px;letter-spacing:.15em;color:var(--gold2);margin:0">${code}</p><button class="btn primary" id="mdOk">Anotei</button>`); $("#mdOk").onclick=closeModal; }
  else adminClick(a,b);
});
function addFriendLocal(v){ const fr=myFriends(); const ex=fr.find(f=>keyOf(f.name)===keyOf(v.name)); const rec={name:v.name, ip:v.ip||ex?.ip||null, bt:v.bt||ex?.bt||null, btName:v.btName||ex?.btName||null, at:Date.now()}; if(ex) Object.assign(ex,rec); else fr.push(rec); }
function setAvatar(file){
  if(!file) return; const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{ const c=document.createElement("canvas"); c.width=c.height=112; const x=c.getContext("2d"); const s=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,112,112); URL.revokeObjectURL(url); me.avatar=c.toDataURL("image/jpeg",.8); save(); renderProfile(); renderPanel(); toast("Foto atualizada."); };
  img.onerror=()=>toast("Esse arquivo não é uma imagem válida."); img.src=url;
}

/* ================= conexão entre aparelhos ================= */
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const Link = NATIVE ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Link") : window.Capacitor.Plugins.Link) : makeSimLink();
const NET = {role:null, via:null, connected:false, room:null, peerAddr:null, peerName:null, offset:0, lastJoin:null, btName:null, stage:null, roomInfo:null, sentFriend:false};
const PROTO = 1;
let btFound = [];
async function netSend(msg){ try{ await Link.send({data:JSON.stringify(msg)}); }catch(e){ /* disconnected handler shows the state */ } }
async function netClose(){ try{ await Link.close(); }catch(e){} Object.assign(NET,{role:null,via:null,connected:false,room:null,peerAddr:null,peerName:null,offset:0,stage:null,roomInfo:null,sentFriend:false}); $("#netOverlay").hidden=true; }
function netCard(html){ $("#netCard").innerHTML=html; $("#netOverlay").hidden=false; }
document.getElementById("netCard").addEventListener("click", e => { const b=e.target.closest("[data-net]"); if(!b) return; const a=b.dataset.net;
  if(a==="cancel"){ netClose(); }
  else if(a==="visible"){ Link.btDiscoverable().catch(()=>toast("Não foi possível deixar o aparelho visível.")); }
  else if(a==="retry" && NET.lastJoin){ const j=NET.lastJoin; j.via==="tcp"?joinByIp(j.ip):joinByBt(j.addr,j.name); }
  else if(a==="closeOverlay"){ $("#netOverlay").hidden=true; }
});

async function ensureBt(){
  try{
    let st=await Link.btStatus(); if(!st.available){ toast("Este aparelho não tem Bluetooth."); return false; }
    if(!st.granted){ const r=await Link.btPermissions(); if(!r.granted){ toast("Sem a permissão de Bluetooth não dá para jogar por Bluetooth."); return false; } }
    st=await Link.btStatus(); if(!st.enabled){ await Link.btEnable(); toast("Ligue o Bluetooth e toque de novo."); return false; }
    return true;
  }catch(e){ toast(e?.message||"Bluetooth indisponível."); return false; }
}
async function hostRoom(via){
  const title=$("#nrTitle").value.trim(); if(!title){ toast("Dê um título para a sala."); $("#nrTitle").focus(); return; }
  const pass=$("#nrPass").value, turnSec=+$("#nrTurn").value; STORE.lastTitle=title; STORE.lastTurn=turnSec; save();
  if(G && G.net && G.status==="playing"){ toast("Termine ou desista do duelo atual antes de criar outra sala."); return; }
  await netClose(); const salt=uidStr();
  NET.room={title,hasPass:!!pass,passHash:pass?await sha("tm:"+salt+":"+pass):null,salt,turnSec}; NET.role="host"; NET.via=via; NET.stage="waiting";
  try{
    if(via==="tcp"){
      const {ip,port}=await Link.getLocalIp(); await Link.tcpHost({port});
      if(!ip){ netCard(`<h2>Sem Wi-Fi</h2><p>Conecte o aparelho a uma rede Wi-Fi (ou ligue o roteador/hotspot) e tente de novo.</p><button class="btn" data-net="cancel">Fechar</button>`); return; }
      netCard(`<span class="label">Sala aberta no Wi-Fi</span><h2 style="font-size:24px">${esc(title)}</h2><p style="margin:0">Peça para o outro jogador digitar este IP em <b>Jogar → Entrar pelo IP</b>:</p>
        <p class="bigip num">${esc(ip)}</p><p class="muted" style="margin:0;font-size:13px">Turnos de ${fmtS(turnSec)}${pass?" · com senha":""} · aguardando oponente…</p><button class="btn danger" data-net="cancel">Fechar sala</button>`);
    } else {
      if(!(await ensureBt())){ NET.role=null; return; }
      const r=await Link.btHost(); NET.btName=r.name;
      netCard(`<span class="label">Sala aberta por Bluetooth</span><h2 style="font-size:24px">${esc(title)}</h2><p style="margin:0">O outro jogador deve tocar em <b>Procurar sala por Bluetooth</b> e escolher:</p>
        <p class="bigip">${esc(r.name||"este aparelho")}</p><p class="muted" style="margin:0;font-size:13px">Se os aparelhos ainda não foram pareados, deixe este visível para o outro encontrar.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn" data-net="visible">Ficar visível</button><button class="btn danger" data-net="cancel">Fechar sala</button></div>`);
    }
  }catch(e){ NET.role=null; netCard(`<h2>Não deu para abrir a sala</h2><p>${esc(e?.message||"Erro desconhecido.")}</p><button class="btn" data-net="cancel">Fechar</button>`); }
}
async function joinByIp(ip){
  if(!ip){ toast("Digite o IP da sala."); return; }
  if(G && G.net && G.status==="playing" && NET.connected){ toast("Você já está num duelo."); return; }
  await netClose(); STORE.lastIp=ip; save(); NET.role="guest"; NET.via="tcp"; NET.stage="connecting"; NET.lastJoin={via:"tcp",ip};
  netCard(`<h2>Conectando…</h2><p>Procurando a sala no IP <b class="num">${esc(ip)}</b>.</p><button class="btn" data-net="cancel">Cancelar</button>`);
  try{ await Link.tcpJoin({ip}); }catch(e){ if(NET.role!=="guest") return; NET.stage=null; netCard(`<h2>Sala não encontrada</h2><p>${esc(e?.message||"Não foi possível conectar.")}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" data-net="retry">Tentar de novo</button><button class="btn ghost" data-net="cancel">Fechar</button></div>`); }
}
async function btFind(){
  if(!(await ensureBt())) return; btFound=[];
  try{ const r=await Link.btPaired(); btFound=(r.devices||[]).map(d=>({...d,paired:true})); }catch(e){}
  renderBtList(true);
  try{ await Link.btScan(); }catch(e){ toast(e?.message||"Não foi possível procurar aparelhos."); }
}
function renderBtList(scanning){
  const L=document.getElementById("btList"); if(!L) return;
  if(!btFound.length){ L.innerHTML = scanning?`<div class="empty">Procurando aparelhos…</div>`:""; return; }
  L.innerHTML = btFound.map(d=>`<div class="row"><div class="grow"><span class="title">${esc(d.name||"Aparelho sem nome")}</span> <span class="muted" style="font-size:12px">${d.paired?"pareado":"por perto"}</span></div><button class="btn sm primary" data-act="btJoin" data-addr="${esc(d.address)}" data-name="${esc(d.name||"")}">Entrar</button></div>`).join("");
}
async function joinByBt(addr,name){
  if(!addr) return; if(!(await ensureBt())) return;
  await netClose(); NET.role="guest"; NET.via="bt"; NET.stage="connecting"; NET.lastJoin={via:"bt",addr,name};
  netCard(`<h2>Conectando…</h2><p>Conectando por Bluetooth a <b>${esc(name||addr)}</b>.</p><button class="btn" data-net="cancel">Cancelar</button>`);
  try{ await Link.btJoin({address:addr}); }catch(e){ if(NET.role!=="guest") return; NET.stage=null; netCard(`<h2>Não conectou</h2><p>${esc(e?.message||"Não foi possível conectar.")}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" data-net="retry">Tentar de novo</button><button class="btn ghost" data-net="cancel">Fechar</button></div>`); }
}

/* link events */
Link.addListener("btDevice", d => { if(!d?.address || btFound.some(x=>x.address===d.address)) return; btFound.push({name:d.name,address:d.address,paired:false}); renderBtList(true); });
Link.addListener("btScanDone", () => renderBtList(false));
Link.addListener("connected", d => {
  NET.connected=true; NET.peerAddr=d.address||null;
  if(NET.role==="host"){ netSend({t:"room",v:PROTO,title:NET.room.title,hasPass:NET.room.hasPass,salt:NET.room.salt,turnSec:NET.room.turnSec,host:me.name,hostAvatar:null}); }
  else { netSend({t:"ping",t0:Date.now()}); }
  renderNetBanner();
});
Link.addListener("disconnected", d => {
  const wasPlaying = G && G.net && G.status==="playing";
  NET.connected=false; NET.sentFriend=false;
  if(NET.role==="host"){
    if(wasPlaying){ toast(`${NET.peerName||"O oponente"} desconectou. A sala continua aberta para ele voltar.`); }
    else if(NET.stage==="waiting"||NET.stage==="joining"){ NET.stage="waiting"; }
  } else if(NET.role==="guest"){
    if(wasPlaying){ toast("Conexão perdida com a sala."); }
    else if(NET.stage && NET.stage!=="connecting"){ netCard(`<h2>Conexão encerrada</h2><p>${esc(d?.reason||"A sala foi fechada.")}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" data-net="retry">Tentar de novo</button><button class="btn ghost" data-net="cancel">Fechar</button></div>`); }
  }
  renderNetBanner();
});
Link.addListener("error", d => toast(d?.message||"Erro de conexão."));
Link.addListener("data", d => { let m; try{ m=JSON.parse(d.line); }catch(e){ return; } onNet(m); });

async function onNet(m){
  if(m.t==="room" && NET.role==="guest"){
    NET.roomInfo=m; NET.stage="room"; NET.peerName=m.host;
    if(m.v!==PROTO){ netCard(`<h2>Versões diferentes</h2><p>O app do outro jogador é de outra versão. Atualizem os dois aparelhos.</p><button class="btn" data-net="cancel">Fechar</button>`); return; }
    // reconexão a um duelo em andamento
    if(G && G.net && G.status==="playing" && G.players.p1.name===m.host){ netSend({t:"join",name:me.name,pass:null,resume:true}); netCard(`<h2>Reconectando…</h2><p>Voltando ao duelo contra ${esc(m.host)}.</p>`); return; }
    netCard(`<span class="label">Sala de ${esc(m.host)}</span><h2 style="font-size:24px">${esc(m.title)}</h2><p class="muted" style="margin:0">Turnos de ${fmtS(m.turnSec)}</p>
      <form id="roomJoinF" style="display:grid;gap:10px">${m.hasPass?`<div class="field"><label class="label" for="rjPass">Senha da sala</label><input id="rjPass" type="password" required></div>`:""}
      <div class="err" id="rjErr"></div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${!isFriendName(m.host)?`<button class="btn ghost" type="button" id="rjFriend">+ Adicionar amigo</button>`:""}<button class="btn primary" type="submit">Entrar no duelo</button><button class="btn ghost" type="button" data-net="cancel">Sair</button></div></form>`);
    const f=document.getElementById("rjFriend"); if(f) f.onclick=()=>sendFriendReq();
    $("#roomJoinF").onsubmit=async e=>{ e.preventDefault(); const p=document.getElementById("rjPass")?.value||""; NET.stage="joining";
      netSend({t:"join",name:me.name,pass:m.hasPass?await sha("tm:"+m.salt+":"+p):null}); };
  }
  else if(m.t==="ping" && NET.role==="host"){ netSend({t:"pong",t0:m.t0,th:Date.now()}); }
  else if(m.t==="pong" && NET.role==="guest"){ const now=Date.now(); NET.offset = m.th - (m.t0+now)/2; }
  else if(m.t==="join" && NET.role==="host"){
    const name=String(m.name||"").slice(0,16); NET.peerName=name;
    if(G && G.net && G.status==="playing"){
      if(keyOf(G.players.p2.name)===keyOf(name)){ netSend({t:"start",g:G}); toast(`${name} voltou ao duelo.`); renderNetBanner(); return; }
      netSend({t:"reject",msg:"Essa sala já está num duelo."}); setTimeout(()=>Link.disconnect().catch(()=>{}),300); return;
    }
    if(NET.room.hasPass && m.pass!==NET.room.passHash){ netSend({t:"reject",msg:"Senha da sala incorreta."}); return; }
    if(keyOf(name)===me.key){ netSend({t:"reject",msg:"Você está usando o mesmo nome de quem criou a sala. Entre com outra conta."}); setTimeout(()=>Link.disconnect().catch(()=>{}),300); return; }
    const g=newGame("net-"+Date.now(),{title:NET.room.title,turnSec:NET.room.turnSec},me,{key:keyOf(name),name}); g.net=true; g.seq=1; g.via=NET.via;
    netSend({t:"start",g}); NET.stage="playing"; $("#netOverlay").hidden=true; openNetGame(g);
  }
  else if(m.t==="reject" && NET.role==="guest"){ NET.stage="room"; const er=document.getElementById("rjErr"); if(er) er.textContent=m.msg; else netCard(`<h2>Não deu para entrar</h2><p>${esc(m.msg)}</p><button class="btn" data-net="cancel">Fechar</button>`); }
  else if(m.t==="start" && NET.role==="guest"){ NET.stage="playing"; $("#netOverlay").hidden=true; openNetGame(m.g); }
  else if(m.t==="state" && G && G.net && m.g && m.g.roomId===G.roomId && (m.g.seq||0)>(G.seq||0)){ applyRemote(m.g); }
  else if(m.t==="friend"){ const nm=String(m.name||"").slice(0,16); if(isFriendName(nm)) { netSend({t:"friendOk",name:me.name}); return; }
    const inv=myInvites(); if(!inv.some(v=>keyOf(v.name)===keyOf(nm))) inv.push({name:nm,...peerContact(),at:Date.now()}); save(); renderInvitesBadge();
    showFriendPrompt(nm); }
  else if(m.t==="friendOk"){ const nm=String(m.name||"").slice(0,16); addFriendLocal({name:nm,...peerContact()}); STORE.invites[me.key]=myInvites().filter(v=>keyOf(v.name)!==keyOf(nm)); save(); renderInvitesBadge(); toast(`${nm} aceitou. Agora vocês são amigos.`); if(G) renderCards(); }
  else if(m.t==="leave"){ toast(`${NET.peerName||"O oponente"} saiu da sala.`); }
}
function peerContact(){ return NET.via==="tcp" ? {ip: NET.role==="guest" ? NET.lastJoin?.ip : NET.peerAddr} : {bt: NET.role==="guest" ? NET.lastJoin?.addr : NET.peerAddr, btName: NET.role==="guest" ? NET.lastJoin?.name : null}; }
function sendFriendReq(){ if(!NET.connected){ toast("Sem conexão com o oponente."); return; } netSend({t:"friend",name:me.name}); NET.sentFriend=true; toast("Convite de amizade enviado."); const f=document.getElementById("rjFriend"); if(f) f.hidden=true; if(G) renderCards(); }
function showFriendPrompt(nm){
  modal(`<h2>Convite de amizade</h2><p><b>${esc(nm)}</b> quer ser seu amigo.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn primary" id="fpOk">Aceitar</button><button class="btn ghost" id="fpNo">Depois</button></div>`);
  $("#fpOk").onclick=()=>{ const inv=myInvites(); const v=inv.find(x=>keyOf(x.name)===keyOf(nm)); STORE.invites[me.key]=inv.filter(x=>x!==v); addFriendLocal(v||{name:nm,...peerContact()}); save(); renderInvitesBadge(); netSend({t:"friendOk",name:me.name}); closeModal(); toast(`${nm} agora é seu amigo.`); if(G) renderCards(); if(view==="friends") renderPanel(); };
  $("#fpNo").onclick=closeModal;
}
function renderNetBanner(){
  const B=$("#gNetBanner"), L=$("#gLink"); if(!G||!G.net){ B.hidden=true; L.hidden=true; return; }
  L.hidden=false; L.innerHTML=`<span class="dot ${NET.connected?"on":""}"></span>${G.via==="bt"?"Bluetooth":"Wi-Fi"}`;
  if(NET.connected || G.status!=="playing"){ B.hidden=true; return; }
  B.hidden=false;
  B.innerHTML = NET.role==="host"
    ? `<div class="grow"><b>${esc(G.players.p2.name)} desconectou.</b> A sala continua aberta: ele pode entrar de novo pelo mesmo ${G.via==="bt"?"Bluetooth":"IP"}.</div>`
    : `<div class="grow"><b>Conexão perdida.</b> O duelo fica pausado até você voltar.</div><button class="btn sm gold" id="nbRetry">Reconectar</button>`;
  const r=document.getElementById("nbRetry"); if(r) r.onclick=()=>{ const j=NET.lastJoin; if(!j) return; j.via==="tcp"?reconnectIp(j.ip):reconnectBt(j.addr,j.name); };
}
async function reconnectIp(ip){ NET.role="guest"; NET.via="tcp"; toast("Reconectando…"); try{ await Link.tcpJoin({ip}); }catch(e){ toast(e?.message||"Não foi possível reconectar."); } }
async function reconnectBt(addr,name){ NET.role="guest"; NET.via="bt"; toast("Reconectando…"); try{ await Link.btJoin({address:addr}); }catch(e){ toast(e?.message||"Não foi possível reconectar."); } }

/* simulated link for testing in a normal browser (two tabs on the same computer) */
function makeSimLink(){
  const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("tm-sim") : null;
  const id = Math.random().toString(36).slice(2); let hosting=false, peer=null; const ls={};
  const emit=(ev,d)=>(ls[ev]||[]).forEach(f=>f(d));
  const post=m=>ch&&ch.postMessage({...m,from:id});
  ch && (ch.onmessage = ({data:m}) => {
    if(m.to && m.to!==id) return;
    if(m.k==="hello" && hosting && !peer){ peer=m.from; post({k:"accept",to:m.from}); emit("connected",{via:"sim",address:"127.0.0.1"}); }
    else if(m.k==="accept" && pendingJoin){ peer=m.from; const r=pendingJoin; pendingJoin=null; emit("connected",{via:"sim",address:"127.0.0.1"}); r(); }
    else if(m.k==="data" && m.from===peer) emit("data",{line:m.data});
    else if(m.k==="bye" && m.from===peer){ peer=null; emit("disconnected",{reason:"O outro jogador saiu."}); }
  });
  let pendingJoin=null;
  const join=()=>new Promise((res,rej)=>{ pendingJoin=res; post({k:"hello"}); setTimeout(()=>{ if(pendingJoin){ pendingJoin=null; rej({message:"Não encontrei uma sala nesse IP. (modo de teste: abra a sala em outra aba)"}); } },1500); });
  return {
    addListener(ev,f){ (ls[ev] ||= []).push(f); return {remove(){}}; },
    async getLocalIp(){ return {ip:"127.0.0.1",port:47800}; },
    async tcpHost(){ hosting=true; }, async btHost(){ hosting=true; return {name:"Aparelho de teste"}; },
    tcpJoin: join, btJoin: join,
    async btStatus(){ return {available:true,enabled:true,granted:true}; }, async btPermissions(){ return {granted:true}; },
    async btEnable(){}, async btDiscoverable(){}, async btPaired(){ return {devices:[{name:"Aparelho de teste",address:"SIM"}]}; },
    async btScan(){ setTimeout(()=>emit("btScanDone",{}),300); },
    async send({data}){ if(!peer) throw {message:"Sem conexão."}; post({k:"data",to:peer,data}); },
    async disconnect(){ if(peer){ post({k:"bye",to:peer}); peer=null; emit("disconnected",{reason:"Conexão encerrada."}); } },
    async close(){ if(peer){ post({k:"bye",to:peer}); } peer=null; hosting=false; }
  };
}

/* ================= game: sync ================= */
function newGame(id,r,host,guest){
  const now=gnow(), pieces=[]; let n=0; const rules=clone(RULES);
  const mana={p1:rules.manaBase,p2:rules.manaBase}, manaMax={p1:rules.manaBase,p2:rules.manaBase};
  for(const side of ["p1","p2"]) for(const [t,row,col] of LAYOUT){ const max=t==="nucleo"?rules.nucleoVidaBase:rules.pecas[t].vida;
      pieces.push({id:"k"+(n++),owner:side,type:t,r:side==="p1"?row:7-row,c:col,hp:max,maxHp:max,element:null,cdUntil:0,sealHp:0,dead:false}); }
  const emptyS=()=>[{state:"empty"},{state:"empty"},{state:"empty"}];
  return {roomId:id,title:r.title,status:"playing",winner:null,players:{p1:{key:host.key,name:host.name},p2:{key:guest.key,name:guest.name}},
    turn:"p1",turnNo:1,turnSec:r.turnSec,turnEndsAt:now+r.turnSec*1000+2000,dice:freshDice(),pieces,structures:[],traps:[],mana,manaMax,timed:[],
    scrolls:{p1:emptyS(),p2:emptyS()},cds:{p1:{},p2:{}},rules,combos:clone(COMBOS.length?COMBOS:DEFAULT_COMBOS),log:[{t:now,x:`Duelo iniciado. ${host.name} começa.`}],createdAt:now,updatedAt:now};
}
const freshDice = () => ({andar:{v:null,used:false},atacar:{v:null,used:false},forca:{v:null,used:false}});
function openNetGame(g){
  G=clone(g); gameId=g.roomId; mySide = keyOf(G.players.p1.name)===me.key ? "p1" : "p2";
  sel=inspect=selScroll=null; pending=[]; spinning={};
  showScreen("game"); $("#endOverlay").hidden=true; renderGame(); renderNetBanner();
  if(G.status==="finished") onFinished();
}
function applyRemote(g){
  const prev=G; G=clone(g);
  if(prev.turn!==G.turn && G.turn===mySide) toast("Sua vez!");
  if(prev.turnNo!==G.turnNo){ spinning={}; pending=[]; selScroll=null; }
  if(!$("#scr-game").hidden) renderGame(); if(G.status==="finished") onFinished();
}
$("#gBack").onclick = () => { $("#endOverlay").hidden=true;
  if(G && G.net && G.status==="finished"){ netClose(); G=null; }
  else if(G && G.ai){ G=null; }
  showScreen("lobby"); renderProfile(); renderPanel(); };
function settle(g,now){
  for(const e of g.timed){ const due=Math.min(e.total,Math.floor((now-e.start)/e.every)); const add=(due-e.done)*e.amt;
    if(add>0){ if(e.kind==="mana") g.mana[e.owner]=Math.min(g.manaMax[e.owner],g.mana[e.owner]+add); else { const c=g.pieces.find(p=>p.owner===e.owner&&p.type==="nucleo"); if(c) c.hp=Math.min(c.maxHp,c.hp+add); } }
    e.done=due; }
  g.timed=g.timed.filter(e=>e.done<e.total); g.traps=g.traps.filter(t=>t.until>now); return g;
}
const V = () => settle(clone(G),gnow());
const isMyTurn = () => G && G.status==="playing" && G.turn===mySide && (!G.net || NET.connected);
function addLog(g,x){ g.log.push({t:Date.now(),x}); if(g.log.length>40) g.log=g.log.slice(-40); }
async function commit(fn){
  if(busy||!G) return; if(G.net && !NET.connected){ toast("Sem conexão com o oponente. A jogada não foi feita."); return; }
  busy=true;
  try{ const g=clone(G), now=gnow(); settle(g,now); if(fn(g,now)===false) return; g.updatedAt=now; g.seq=(g.seq||0)+1; G=g; renderGame();
    if(g.ai){ aiGame=g; if(g.status==="finished") onFinished(); else setTimeout(maybeAi,0); return; }
    if(g.net){ await netSend({t:"state",g}); if(g.status==="finished") onFinished(); }
  } finally { busy=false; }
}
function endTurn(g,now,why){
  const nx=other(g.turn); addLog(g, why==="tempo"?`Tempo esgotado para ${g.players[g.turn].name}.`:`${g.players[g.turn].name} passou a vez.`);
  g.turn=nx; g.turnNo++; g.turnEndsAt=now+g.turnSec*1000; g.dice=freshDice();
  g.mana[nx]=Math.min(g.manaMax[nx],g.mana[nx]+g.rules.manaPorTurno);
}
$("#gPass").onclick = () => { if(!isMyTurn()) return toast("Espere a sua vez."); const tn=G.turnNo; commit((g,now)=>{ if(g.turnNo!==tn) return false; endTurn(g,now,"passou"); }); };
$("#gQuit").onclick = () => { if(G?.status==="playing" && mySide) $("#confirmQuit").hidden=false; };
$("#cqNo").onclick = () => $("#confirmQuit").hidden=true;
$("#cqYes").onclick = () => { $("#confirmQuit").hidden=true;
  if(G.net && !NET.connected){ G.status="finished"; G.winner=other(mySide); addLog(G,`${G.players[mySide].name} desistiu.`); renderGame(); onFinished(); return; }
  commit(g=>{ if(g.status!=="playing") return false; g.status="finished"; g.winner=other(mySide); addLog(g,`${g.players[mySide].name} desistiu.`); }); };
function onFinished(){
  const won = G.winner===mySide; const o=$("#endOverlay");
  o.innerHTML = `<div class="card"><h2>${won?"Vitória!":"Derrota"}</h2><p>${esc(G.players[G.winner]?.name||"")} venceu o duelo.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="eoView">Ver tabuleiro</button><button class="btn primary" id="eoBack">Voltar ao menu</button></div></div>`;
  o.hidden=false; $("#eoBack").onclick=()=>{ o.hidden=true; $("#gBack").click(); }; $("#eoView").onclick=()=>o.hidden=true;
  if(finishedHandled[G.roomId]) return; finishedHandled[G.roomId]=1;
  if(won) me.wins=(me.wins||0)+1; else me.losses=(me.losses||0)+1; save(); renderProfile();
}
setInterval(()=>{
  if(!G||$("#scr-game").hidden) return; renderClock();
  if(G.status!=="playing"||!mySide) return; if(G.net && !NET.connected) return;
  const now=gnow(), tn=G.turnNo;
  const late = G.turn===mySide ? now>G.turnEndsAt : now>G.turnEndsAt+5000;
  if(late && !timeoutSent[G.roomId+tn]){ timeoutSent[G.roomId+tn]=1; commit((g,n)=>{ if(g.turnNo!==tn||g.status!=="playing") return false; endTurn(g,n,"tempo"); }); }
},500);
setInterval(()=>{ if(G && !$("#scr-game").hidden){ renderBoard(); renderCards(); } },1000);

/*@@GAME_CORE@@*/

/* ================= admin (local) ================= */
function renderAdmin(){
  const P=$("#panel"); if(!me.isAdmin){ P.innerHTML=`<div class="card empty">Esta página é só do administrador.</div>`; return; }
  const tabs=`<div class="tabs" role="tablist">${[["combos","Combinações"],["rules","Regras e peças"],["accounts","Contas"]].map(([k,l])=>`<button role="tab" aria-selected="${adminTab===k}" data-act="atab" data-k="${k}">${l}</button>`).join("")}</div>`;
  if(adminTab==="combos"){
    const d=comboDraft; const slot=i=>`<div class="field"><span class="label">Cor cristal ${i+1}: ${d.c[i]?CR[d.c[i]].name:"—"}</span><div class="swatches">${CRYSTALS.map(c=>`<button type="button" class="sw" data-act="pick" data-slot="${i}" data-c="${c.id}" aria-pressed="${d.c[i]===c.id}" title="${c.name}">${gem(c.id)}</button>`).join("")}</div></div>`;
    P.innerHTML=`<div class="card"><div class="panel-head"><h2>Administração</h2></div>${tabs}
      <p class="muted" style="margin-top:0;font-size:13px;max-width:65ch">As combinações e regras deste aparelho valem nos duelos em que ele cria a sala. Quem entra na sala joga com as combinações de quem criou.</p>
      <div class="grid2" style="align-items:start">
        <form id="comboF" style="display:grid;gap:12px">
          <h3 style="font-size:18px">${editingCombo?"Editar combinação":"Nova combinação"}</h3>
          ${slot(0)}${slot(1)}${slot(2)}
          <div class="field"><label class="label" for="cbEff">Efeito</label><select id="cbEff">${Object.entries(EFFECTS).map(([k,e])=>`<option value="${k}" ${d.effect===k?"selected":""}>${e.name}</option>`).join("")}</select></div>
          <p class="muted" style="margin:0;font-size:13px" id="cbTxt">${EFFECTS[d.effect].txt(RULES)}</p>
          <div class="form-inline"><div class="field"><label class="label" for="cbMana">Consumo de mana</label><input id="cbMana" type="number" min="0" value="${d.mana}"></div><div class="field"><label class="label" for="cbCd">Intervalo para usar novamente (s)</label><input id="cbCd" type="number" min="0" value="${d.cd}"></div></div>
          <div class="err" id="cbErr"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">${editingCombo?"Salvar alterações":"Criar combinação"}</button>${editingCombo?`<button class="btn ghost" type="button" data-act="cancelEdit">Cancelar</button>`:""}</div>
          <p class="muted" style="margin:0;font-size:13px">A ordem dos cristais não importa.</p>
        </form>
        <div style="min-width:0"><h3 style="font-size:18px;margin-bottom:10px">Combinações cadastradas (${COMBOS.length})</h3>
          <div class="list">${COMBOS.slice().sort((a,b)=>(EFFECTS[a.effect]?.name||"").localeCompare(EFFECTS[b.effect]?.name||"")).map(c=>`<div class="row">${gemsInline([c.c1,c.c2,c.c3])}<div class="grow"><b>${esc(EFFECTS[c.effect]?.name||c.effect)}</b><div class="muted num" style="font-size:13px">${c.mana} de mana · intervalo ${fmtS(c.cooldown)}</div></div><button class="btn sm" data-act="editCombo" data-id="${c.id}">Editar</button><button class="btn sm danger" data-act="delCombo" data-id="${c.id}">Excluir</button></div>`).join("")||`<div class="empty">Nenhuma combinação. Sem combinações, toda fusão de cristais dá resultado zero.</div>`}</div>
          <button class="btn sm ghost" style="margin-top:10px" data-act="resetCombos">Restaurar combinações sugeridas</button></div>
      </div></div>`;
    $("#cbEff").onchange=e=>{ comboDraft.effect=e.target.value; $("#cbTxt").textContent=EFFECTS[comboDraft.effect].txt(RULES); };
    $("#cbMana").oninput=e=>comboDraft.mana=+e.target.value; $("#cbCd").oninput=e=>comboDraft.cd=+e.target.value;
    $("#comboF").onsubmit=e=>{ e.preventDefault(); const er=$("#cbErr"); const d=comboDraft;
      if(d.c.some(x=>!x)){ er.textContent="Escolha as três cores de cristal."; return; }
      const k=[...d.c].sort().join("|"); const dup=COMBOS.find(c=>[c.c1,c.c2,c.c3].sort().join("|")===k);
      if(dup && dup.id!==editingCombo){ er.textContent=`Essa combinação de cores já existe (${EFFECTS[dup.effect]?.name}).`; return; }
      const body={id:editingCombo||uidStr(),c1:d.c[0],c2:d.c[1],c3:d.c[2],effect:d.effect,mana:Math.max(0,+d.mana||0),cooldown:Math.max(0,+d.cd||0)};
      const i=COMBOS.findIndex(c=>c.id===body.id); if(i>=0) COMBOS[i]=body; else COMBOS.push(body);
      STORE.combos=COMBOS; save(); editingCombo=null; comboDraft={c:[null,null,null],effect:"curar",mana:8,cd:30}; toast("Combinação salva."); renderPanel(); };
  }
  else if(adminTab==="rules"){
    const R=RULES;
    P.innerHTML=`<div class="card"><div class="panel-head"><h2>Administração</h2></div>${tabs}
      <form id="rulesF" style="display:grid;gap:18px">
        <div class="tablewrap"><table><thead><tr><th>Peça</th><th>Vida</th><th>Força</th><th>Distância ataque</th><th>Distância andar</th><th>Intervalo (s)</th></tr></thead><tbody>
        ${Object.keys(PIECES).map(t=>`<tr><td>${PIECES[t]}</td>${["vida","forca","atq","andar","intervalo"].map(f=>t==="nucleo"&&f==="vida"?`<td class="muted">ver abaixo</td>`:`<td><input type="number" min="0" id="pc-${t}-${f}" value="${R.pecas[t][f]}"></td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
        <div class="grid2">${Object.keys(RULE_LABELS).map(k=>`<div class="field"><label class="label" for="ru-${k}">${RULE_LABELS[k]}</label><input type="number" min="0" id="ru-${k}" value="${R[k]}"></div>`).join("")}</div>
        <p class="muted" style="margin:0;font-size:13px">As regras valem para todos os duelistas igualmente, a partir do próximo duelo criado neste aparelho.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">Salvar regras</button><button class="btn ghost" type="button" data-act="resetRules">Restaurar padrão</button></div>
      </form></div>`;
    $("#rulesF").onsubmit=e=>{ e.preventDefault(); const out=clone(DEFAULT_RULES);
      for(const t of Object.keys(PIECES)) for(const f of ["vida","forca","atq","andar","intervalo"]){ const el=document.getElementById(`pc-${t}-${f}`); if(el) out.pecas[t][f]=Math.max(0,+el.value||0); }
      for(const k of Object.keys(RULE_LABELS)) out[k]=Math.max(0,+document.getElementById("ru-"+k).value||0);
      if(out.manaBase<1) out.manaBase=1; if(out.nucleoVidaBase<1) out.nucleoVidaBase=1;
      STORE.rules=out; RULES=mergeRules(out); save(); renderProfile(); toast("Regras salvas."); };
  }
  else {
    const accs=Object.values(STORE.accounts).sort((a,b)=>a.createdAt-b.createdAt);
    P.innerHTML=`<div class="card"><div class="panel-head"><h2>Administração</h2></div>${tabs}
      <p class="muted" style="margin-top:0;font-size:13px">Contas criadas neste aparelho. Use “Trocar senha” quando alguém perder a senha e o código de recuperação.</p>
      <div class="list">${accs.map(a=>`<div class="row"><div class="grow"><span class="title">${esc(a.name)}</span> ${a.isAdmin?`<span class="chip">administrador</span>`:""}<div class="muted num" style="font-size:13px">${a.wins||0} vitórias · ${a.losses||0} derrotas · criada em ${new Date(a.createdAt).toLocaleDateString("pt-BR")}</div></div>
        <input id="tp-${esc(a.key)}" type="password" placeholder="Nova senha" style="width:130px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:.45em .6em">
        <button class="btn sm" data-act="setPw" data-key="${esc(a.key)}">Trocar senha</button>
        ${a.key!==me.key?`<button class="btn sm ghost" data-act="toggleAdmin" data-key="${esc(a.key)}">${a.isAdmin?"Tirar admin":"Tornar admin"}</button><button class="btn sm danger" data-act="delAcc" data-key="${esc(a.key)}">Excluir</button>`:""}</div>`).join("")}</div></div>`;
  }
}
async function adminClick(a,b){
  if(!me?.isAdmin) return;
  if(a==="atab"){ adminTab=b.dataset.k; renderPanel(); }
  else if(a==="pick"){ comboDraft.c[+b.dataset.slot]=b.dataset.c; renderPanel(); }
  else if(a==="editCombo"){ const c=COMBOS.find(x=>x.id===b.dataset.id); editingCombo=c.id; comboDraft={c:[c.c1,c.c2,c.c3],effect:c.effect,mana:c.mana,cd:c.cooldown}; renderPanel(); }
  else if(a==="cancelEdit"){ editingCombo=null; comboDraft={c:[null,null,null],effect:"curar",mana:8,cd:30}; renderPanel(); }
  else if(a==="delCombo"){ if(b.dataset.confirm!=="1"){ b.dataset.confirm="1"; b.textContent="Confirmar exclusão"; return; } COMBOS=COMBOS.filter(c=>c.id!==b.dataset.id); STORE.combos=COMBOS; save(); toast("Combinação excluída."); renderPanel(); }
  else if(a==="resetCombos"){ if(b.dataset.confirm!=="1"){ b.dataset.confirm="1"; b.textContent="Confirmar: trocar todas pelas sugeridas"; return; } COMBOS=clone(DEFAULT_COMBOS); STORE.combos=COMBOS; save(); renderPanel(); }
  else if(a==="resetRules"){ STORE.rules=null; RULES=mergeRules(null); save(); renderProfile(); renderPanel(); toast("Regras restauradas."); }
  else if(a==="setPw"){ const k=b.dataset.key, pw=document.getElementById("tp-"+k).value; if(pw.length<4) return toast("A senha precisa de 4 caracteres ou mais.");
    const acc=STORE.accounts[k]; acc.salt=newSalt(); acc.hash=await pbkdf2(pw,acc.salt); await save(true); toast(`Senha de ${acc.name} trocada.`); renderPanel(); }
  else if(a==="toggleAdmin"){ const acc=STORE.accounts[b.dataset.key]; acc.isAdmin=!acc.isAdmin; save(); renderPanel(); }
  else if(a==="delAcc"){ if(b.dataset.confirm!=="1"){ b.dataset.confirm="1"; b.textContent="Confirmar exclusão"; return; } const k=b.dataset.key; delete STORE.accounts[k]; delete STORE.friends[k]; delete STORE.invites[k]; save(); renderPanel(); }
}

/* ================= boot ================= */
(async function boot(){
  showScreen("login");
  await loadStore();
  if(STORE.session && STORE.accounts[STORE.session]) enter(STORE.accounts[STORE.session]);
  if(!NATIVE) console.info("Tabuleiro Mágico: modo navegador — a conexão é simulada entre abas.");
})();
