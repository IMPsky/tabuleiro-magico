/* ================= state ================= */
let me = null, view = "home", IMGS = {};
let aiGame=null, aiRunning=false, gameUnsub=null;
let G=null, gameId=null, mySide=null, sel=null, inspect=null, selScroll=null, pending=[], spinning={}, busy=false;
const timeoutSent = {}; let lastFlash=null, finishedHandled={};
const gnow = () => Date.now() + (NET.offset||0);

/* ================= storage (no aparelho) ================= */
const Pref = window.Capacitor?.isNativePlatform?.() ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Preferences") : window.Capacitor.Plugins.Preferences) : null;
const STORE_KEY = "tm.store" + (window.Capacitor?.isNativePlatform?.() ? "" : (location.hash||"")); // no navegador, #a/#b simulam aparelhos diferentes
let STORE = {accounts:{}, friends:{}, invites:{}, session:null, v:2};
async function loadStore(){
  try{ const raw = Pref ? (await Pref.get({key:STORE_KEY})).value : localStorage.getItem(STORE_KEY); if(raw) STORE = Object.assign(STORE, JSON.parse(raw)); }catch(e){}
  delete STORE.combos; delete STORE.rules;
}
let saveT=null;
function save(now){ clearTimeout(saveT); const run=async()=>{ const raw=JSON.stringify(STORE); try{ if(Pref) await Pref.set({key:STORE_KEY,value:raw}); else localStorage.setItem(STORE_KEY,raw); }catch(e){ toast("Não foi possível salvar no aparelho."); } }; if(now) return run(); saveT=setTimeout(run,200); }
const myFriends = () => (STORE.friends[me.key] ||= []);
const myInvites = () => (STORE.invites[me.key] ||= []);
const isFriendName = n => myFriends().some(f=>keyOf(f.name)===keyOf(n));

/* ================= screens ================= */
function showScreen(id){ for(const s of ["login","lobby","game"]) $("#scr-"+s).hidden = s!==id; window.scrollTo(0,0); }
$("#armyL").innerHTML = [1,2,3,4].map(()=>icon("placa")).join("");
$("#armyR").innerHTML = [1,2,3,4].map(()=>icon("placa")).join("");
const myArsenal = () => (me.arsenal ||= defaultArsenal());
const myImgs = () => ({plates:myArsenal().filter(x=>x.on).slice(0,MAX_PLATES).map(x=>x.img||null), core:me.coreImg||null, tomb:me.tombImg||null});
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
      STORE.accounts[key]={key,name,salt,hash,rsalt,rhash:await pbkdf2(code,rsalt),avatar:null,wins:0,losses:0,arsenal:defaultArsenal(),createdAt:Date.now()};
      await save(true);
      modal(`<h2>Conta criada</h2><p>Guarde este código. Ele troca sua senha se você esquecer.</p><p style="font-family:var(--display);font-size:30px;letter-spacing:.15em;color:var(--gold2);margin:0">${code}</p><button class="btn primary" id="mdOk">Anotei, entrar</button>`);
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
  delete acc.isAdmin; myArsenal(); showScreen("lobby"); renderProfile(); renderInvitesBadge(); go("home");
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
      <div class="stat"><span class="label">Séries vencidas</span><b class="num">${me.wins||0}</b></div>
      <div class="stat"><span class="label">Séries perdidas</span><b class="num">${me.losses||0}</b></div>
    </div>
    <button class="btn primary" data-go="play">Jogar</button>
    <button class="btn" data-go="arsenal">Arsenal</button>
    <button class="btn" data-go="friends">Lista de amigos</button>`;
}
$("#profileCard").onclick = e => { const b=e.target.closest("[data-go]"); if(b) go(b.dataset.go); };

function resumeBanner(){
  let h="";
  if(G && G.net && !G.series.done && $("#scr-game").hidden) h+=`<div class="banner"><div class="grow"><b>Série em andamento</b> contra ${esc(teamName(G,otherTeam(myTeam())))}.</div><button class="btn gold sm" data-act="resumeNet">Voltar ao duelo</button></div>`;
  if(aiGame && aiGame.status==="playing") h+=`<div class="banner"><div class="grow"><b>Série contra a IA em andamento.</b></div><button class="btn gold sm" data-act="resumeAi">Voltar ao duelo</button></div>`;
  return h;
}
function renderPanel(){
  if(!me) return; const P=$("#panel"); const resume=resumeBanner();
  if(view==="home"){
    const ars=myArsenal(), on=ars.filter(x=>x.on);
    P.innerHTML = resume + `<div class="card"><div class="panel-head"><h2>Como funciona</h2><button class="btn" data-go="arsenal">Abrir Arsenal</button><button class="btn primary" data-go="play">Jogar</button></div>
      <div style="display:grid;gap:10px;max-width:68ch">
        <p style="margin:0">Suas peças são <b>placas de pedra</b>. No <b>Arsenal</b> você dá nome e imagem a cada placa e distribui <b>${RULES.pontosArsenal} pontos</b> entre vida, força, distância de ataque, distância de andar e intervalo. Cada duelista monta as suas, então nenhum exército é igual ao outro.</p>
        <p style="margin:0">Cada turno você tem três dados: <b>Andar</b>, <b>Atacar</b> e <b>Força</b>. O resultado nunca passa do limite da placa. Vence o duelo quem zerar o <b>Núcleo Mágico</b> do oponente.</p>
        <p style="margin:0">As partidas são <b>séries de melhor de 3</b>: quem vencer 2 duelos leva a série. As combinações de cristais são <b>sorteadas</b> quando a sala é criada e ficam iguais até o fim da série.</p>
        <p style="margin:0">A recarga de um pergaminho usado só corre durante a vez do oponente. O <b>Campo elemental</b> pinta o tabuleiro com a cor de um elemento e dá +${RULES.bonusCampo} de dano às placas desse elemento, dos dois lados.</p>
      </div>
      <h3 class="label" style="margin:18px 0 10px">Suas placas em campo (${on.length})</h3>
      <div class="pieces-guide">${on.map((pl,i)=>{ const st=plateStats(pl); return `<div class="pg">${pl.img?`<img class="pg-img" alt="" src="${esc(pl.img)}">`:icon("placa")}<div class="nm">${esc(pl.name||`Placa ${i+1}`)}</div><div class="st num">Vida ${st.vida} · Força ${st.forca}<br>Ataque ${st.atq} · Andar ${st.andar}<br>Intervalo ${st.intervalo}s</div></div>`; }).join("")}</div></div>`;
  }
  else if(view==="arsenal"){ renderArsenal(P); }
  else if(view==="combos"){ renderCombosPage(P); }
  else if(view==="play"){
    const lastIp = STORE.lastIp || "";
    P.innerHTML = resume + `<div class="card" style="display:grid;gap:18px">
      <div class="panel-head" style="margin:0"><h2>Jogar</h2></div>
      <section style="display:grid;gap:10px"><h3 style="font-size:18px">Criar sala</h3>
        <form class="form-inline" id="newRoom">
          <div class="field"><label class="label" for="nrTitle">Título da sala</label><input id="nrTitle" maxlength="40" placeholder="Duelo dos magos" value="${esc(STORE.lastTitle||"")}" required></div>
          <div class="field" style="max-width:160px"><label class="label" for="nrPass">Senha (opcional)</label><input id="nrPass" type="password" maxlength="20" autocomplete="off"></div>
          <fieldset class="modepick"><legend class="label">Modo</legend>
            <label><input type="radio" name="nrMode" value="1x1" ${(STORE.lastMode||"1x1")==="1x1"?"checked":""}> 1 x 1</label>
            <label><input type="radio" name="nrMode" value="2x2" ${STORE.lastMode==="2x2"?"checked":""}> 2 x 2 (4 jogadores)</label></fieldset>
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
  else if(a==="invOk"){ const v=myInvites().splice(i,1)[0]; addFriendLocal(v); save(); renderInvitesBadge(); renderPanel(); toast(`${v.name} agora é seu amigo.`);
    const r={t:"friendOk",from:me.name,to:v.name}; if(NET.role==="host"){ const p=peerByName(v.name); if(p) netSend(r,p); } else if(NET.connected) netSend(r); }
  else if(a==="invNo"){ myInvites().splice(i,1); save(); renderInvitesBadge(); renderPanel(); }
  else if(a==="fIp") joinByIp(myFriends()[i].ip);
  else if(a==="fBt") joinByBt(myFriends()[i].bt, myFriends()[i].btName);
  else if(a==="fDel"){ myFriends().splice(i,1); save(); renderPanel(); }
  else if(a==="rmAvatar"){ me.avatar=null; save(); renderProfile(); renderPanel(); }
  else if(a==="newCode"){ const code=newCode(); me.rsalt=newSalt(); me.rhash=await pbkdf2(code,me.rsalt); await save(true); modal(`<h2>Novo código</h2><p>Guarde este código de recuperação:</p><p style="font-family:var(--display);font-size:30px;letter-spacing:.15em;color:var(--gold2);margin:0">${code}</p><button class="btn primary" id="mdOk">Anotei</button>`); $("#mdOk").onclick=closeModal; }
  else arsenalClick(a,b,i);
});
function addFriendLocal(v){ const fr=myFriends(); const ex=fr.find(f=>keyOf(f.name)===keyOf(v.name)); const rec={name:v.name, ip:v.ip||ex?.ip||null, bt:v.bt||ex?.bt||null, btName:v.btName||ex?.btName||null, at:Date.now()}; if(ex) Object.assign(ex,rec); else fr.push(rec); }
function setAvatar(file){
  if(!file) return; const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{ const c=document.createElement("canvas"); c.width=c.height=112; const x=c.getContext("2d"); const s=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,112,112); URL.revokeObjectURL(url); me.avatar=c.toDataURL("image/jpeg",.8); save(); renderProfile(); renderPanel(); toast("Foto atualizada."); };
  img.onerror=()=>toast("Esse arquivo não é uma imagem válida."); img.src=url;
}

/* ================= página Combinações ================= */
function renderCombosPage(P){
  const range=(a,b,u="")=>a===b?`${a}${u}`:`${a} a ${b}${u}`;
  const card=k=>{ const E=EFFECTS[k], c=EFFECT_COST[k]||[5,8,[20,30,45]];
    return `<div class="combo-card"><div class="cc-head"><h3>${E.emoji?`<span class="emo">${E.emoji}</span> `:""}${esc(E.name)}</h3></div>
      <p style="margin:0">${E.txt(RULES)}</p>
      <div class="cc-meta"><span class="chip">Alvo: ${TARGET_TXT[E.target]}</span><span class="chip">Mana: ${range(c[0],c[1])}</span><span class="chip">Intervalo: ${range(Math.min(...c[2]),Math.max(...c[2])," s")}</span></div></div>`; };
  const base=Object.keys(EFFECTS).filter(k=>!EFFECTS[k].element), els=Object.keys(EFFECTS).filter(k=>EFFECTS[k].element);
  P.innerHTML = resumeBanner() + `<div class="card" style="display:grid;gap:16px"><div class="panel-head" style="margin:0"><h2>Combinações</h2></div>
    <p class="muted" style="margin:0;max-width:68ch">Estas são todas as habilidades que existem no jogo. Cada uma nasce da fusão de 3 cristais num pergaminho, mas as cores são <b>sorteadas</b> sempre que uma sala é criada e só valem até o fim daquela série. Durante o duelo, o botão “últimas” ao lado dos cristais mostra o que você já tentou.</p>
    <h3 class="label">Efeitos</h3><div class="combo-grid">${base.map(card).join("")}</div>
    <h3 class="label">Elementos</h3><div class="combo-grid">${els.map(card).join("")}</div>
    <p class="muted" style="margin:0;font-size:13px">A mana e o intervalo exatos de cada habilidade também são sorteados com a sala, dentro das faixas acima. O intervalo só corre durante a vez do adversário.</p></div>`;
}

/* ================= Arsenal (placas de pedra) ================= */
function renderArsenal(P){
  const ars=myArsenal(), used=arsenalPoints(ars), left=RULES.pontosArsenal-used;
  const pos={}; let n=0; ars.forEach((pl,i)=>{ if(pl.on && n<SLOTS.length) pos[SLOTS[n++].join(",")]=i; });
  const cell=(r,c)=>{ if(r===CORE_POS[0]&&c===CORE_POS[1]) return `<div class="ap-cell core" title="Núcleo Mágico">${icon("nucleo")}</div>`;
    const i=pos[r+","+c]; if(i==null) return `<div class="ap-cell"></div>`; const pl=ars[i];
    return `<div class="ap-cell on" title="${esc(pl.name||`Placa ${i+1}`)}">${pl.img?`<img alt="" src="${esc(pl.img)}">`:`<span>${i+1}</span>`}</div>`; };
  const preview=[1,0].map(r=>[...Array(8)].map((_,c)=>cell(r,c)).join("")).join("");
  P.innerHTML = resumeBanner() + `<div class="card" style="display:grid;gap:16px">
    <div class="panel-head" style="margin:0"><h2>Arsenal</h2><span class="chip num ${left<0?"bad":""}" style="font-size:14px;padding:4px 12px"><b>${left}</b>&nbsp;de ${RULES.pontosArsenal} pontos livres</span></div>
    <p class="muted" style="margin:0;max-width:66ch">Dê nome e imagem às suas placas de pedra e distribua os pontos entre os atributos. Só as placas marcadas como <b>em campo</b> entram no duelo e gastam pontos. Elas ocupam o tabuleiro nesta ordem (no 2 x 2 entram só as 7 primeiras):</p>
    <div class="ap-grid" aria-label="Posição das placas no seu lado do tabuleiro">${preview}</div>
    <div class="plates">
      <div class="plate-card special"><div class="pc-head">
        <button class="plate-img" data-act="pimg" data-i="core" aria-label="Escolher imagem do núcleo">${me.coreImg?`<img alt="" src="${esc(me.coreImg)}">`:icon("nucleo")}</button>
        <div style="flex:1"><b>Núcleo Mágico</b><p class="muted" style="margin:2px 0 0;font-size:13px">Vida ${RULES.nucleoVidaBase}. Anda pelo dado Andar e não ataca.</p>${me.coreImg?`<button class="btn sm ghost" data-act="pimgDel" data-i="core">Tirar imagem</button>`:""}</div>
        <input type="file" accept="image/*" id="pf-core" data-file="core" hidden></div></div>
      <div class="plate-card special"><div class="pc-head">
        <button class="plate-img" data-act="pimg" data-i="tomb" aria-label="Escolher imagem da lápide">${me.tombImg?`<img alt="" src="${esc(me.tombImg)}">`:icon("lapide")}</button>
        <div style="flex:1"><b>Lápide</b><p class="muted" style="margin:2px 0 0;font-size:13px">Aparece no lugar das suas placas derrotadas.</p>${me.tombImg?`<button class="btn sm ghost" data-act="pimgDel" data-i="tomb">Tirar imagem</button>`:""}</div>
        <input type="file" accept="image/*" id="pf-tomb" data-file="tomb" hidden></div></div>
      ${ars.map((pl,i)=>{ const st=plateStats(pl);
      return `<div class="plate-card ${pl.on?"":"off"}">
        <div class="pc-head">
          <button class="plate-img" data-act="pimg" data-i="${i}" aria-label="Escolher imagem da placa ${i+1}">${pl.img?`<img alt="" src="${esc(pl.img)}">`:icon("placa")}</button>
          <div style="min-width:0;flex:1;display:grid;gap:4px"><input class="pname" data-name="${i}" maxlength="20" placeholder="Placa ${i+1} (sem nome)" value="${esc(pl.name||"")}" aria-label="Nome da placa ${i+1}">
            <label class="switch"><input type="checkbox" data-on="${i}" ${pl.on?"checked":""}> Em campo</label></div>
          <input type="file" accept="image/*" id="pf-${i}" data-file="${i}" hidden>
        </div>
        <div class="attrs">${ATTRS.map(a=>`<div class="attr"><span class="label">${a.label}</span>
          <button class="step" data-act="pt" data-i="${i}" data-k="${a.k}" data-d="-1" ${pl.p[a.k]<=0?"disabled":""} aria-label="Menos ${a.label}">−</button>
          <b class="num">${st[a.k]}${a.unit}</b>
          <button class="step" data-act="pt" data-i="${i}" data-k="${a.k}" data-d="1" ${pl.p[a.k]>=a.maxP?"disabled":""} aria-label="Mais ${a.label}">+</button>
          <span class="muted num">${pl.p[a.k]} pt</span></div>`).join("")}</div>
        <div class="pc-foot"><span class="muted num">${platePoints(pl)} pontos nesta placa</span>
          <span style="display:flex;gap:6px">${pl.img?`<button class="btn sm ghost" data-act="pimgDel" data-i="${i}">Tirar imagem</button>`:""}<button class="btn sm ghost" data-act="pup" data-i="${i}" ${i===0?"disabled":""} aria-label="Subir">↑</button><button class="btn sm ghost" data-act="pdown" data-i="${i}" ${i===ars.length-1?"disabled":""} aria-label="Descer">↓</button></span></div>
      </div>`; }).join("")}</div>
    <p class="muted" style="margin:0;font-size:13px">Cada ponto vale: +2 de vida, +1 de força, +1 de distância de ataque, +1 de distância de andar ou −5 s de intervalo. Mudanças no Arsenal valem a partir da próxima série.</p>
    <div><button class="btn ghost sm" data-act="arsReset">Voltar ao arsenal inicial</button></div></div>`;
}
function arsenalClick(a,b,i){
  const ars=myArsenal(); const pl=ars[i]; const sp=b.dataset.i;
  if(a==="pimg" && (sp==="core"||sp==="tomb")){ document.getElementById("pf-"+sp)?.click(); return; }
  if(a==="pimgDel" && (sp==="core"||sp==="tomb")){ me[sp+"Img"]=null; save(); renderPanel(); return; }
  if(a==="pt"){ const k=b.dataset.k, d=+b.dataset.d, A=ATTRS.find(x=>x.k===k), nv=pl.p[k]+d;
    if(nv<0||nv>A.maxP) return;
    if(d>0 && pl.on && arsenalPoints(ars)>=RULES.pontosArsenal) return toast("Sem pontos livres. Tire pontos de outra placa ou deixe uma placa fora de campo.");
    pl.p[k]=nv; save(); renderPanel(); }
  else if(a==="pimg"){ document.getElementById("pf-"+i)?.click(); }
  else if(a==="pimgDel"){ pl.img=null; save(); renderPanel(); }
  else if(a==="pup"&&i>0){ [ars[i-1],ars[i]]=[ars[i],ars[i-1]]; save(); renderPanel(); }
  else if(a==="pdown"&&i<ars.length-1){ [ars[i+1],ars[i]]=[ars[i],ars[i+1]]; save(); renderPanel(); }
  else if(a==="arsReset"){ if(b.dataset.confirm!=="1"){ b.dataset.confirm="1"; b.textContent="Confirmar: apagar nomes, imagens e pontos"; return; } me.arsenal=defaultArsenal(); save(); renderPanel(); }
}
document.getElementById("panel").addEventListener("change", async e => {
  if(!me || view!=="arsenal") return; const ars=myArsenal(), t=e.target;
  if(t.dataset.name!=null){ ars[+t.dataset.name].name=t.value.trim().slice(0,20); save(); }
  else if(t.dataset.on!=null){ const pl=ars[+t.dataset.on];
    if(t.checked && arsenalPoints(ars)+platePoints(pl)>RULES.pontosArsenal){ t.checked=false; return toast(`Faltam pontos: esta placa usa ${platePoints(pl)}. Tire pontos dela ou de outra placa.`); }
    if(!t.checked && ars.filter(x=>x.on).length<=1){ t.checked=true; return toast("Pelo menos uma placa precisa ficar em campo."); }
    pl.on=t.checked; save(); renderPanel(); }
  else if(t.dataset.file!=null && t.files?.[0]){ try{ const img=await shrinkImage(t.files[0],96); if(t.dataset.file==="core"||t.dataset.file==="tomb") me[t.dataset.file+"Img"]=img; else ars[+t.dataset.file].img=img; save(); renderPanel(); }catch(err){ toast(err.message); } }
});
document.getElementById("panel").addEventListener("input", e => { if(me && view==="arsenal" && e.target.dataset.name!=null){ myArsenal()[+e.target.dataset.name].name=e.target.value.slice(0,20); save(); } });

/* ================= conexão entre aparelhos ================= */
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const Link = NATIVE ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Link") : window.Capacitor.Plugins.Link) : makeSimLink();
/* host: peers = {idDaConexão:{name, side, addr, connected}}; roster = jogadores na sala de espera */
const NET = {role:null, via:null, mode:"1x1", connected:false, room:null, peers:{}, roster:[], offset:0, lastJoin:null, stage:null, roomInfo:null, sentFriend:new Set(), opLog:[], opSeqs:new Set()};
const PROTO = 4;
let btFound = [];
const needPlayers = mode => mode==="2x2" ? 4 : 2;
async function netSend(msg,peer){ try{ await Link.send(peer?{data:JSON.stringify(msg),peer}:{data:JSON.stringify(msg)}); }catch(e){ /* quem caiu é tratado no evento de desconexão */ } }
function forward(msg,exceptPeer){ for(const [id,p] of Object.entries(NET.peers)) if(id!==exceptPeer && p.connected) netSend(msg,id); }
function peerByName(name){ return Object.entries(NET.peers).find(([id,p])=>p.connected&&keyOf(p.name)===keyOf(name))?.[0]; }
function netOk(){ if(!G||!G.net) return true; if(NET.role==="guest") return NET.connected; return G.mode==="2x2" || Object.values(NET.peers).some(p=>p.connected&&p.side); }
async function netClose(){ try{ await Link.close(); }catch(e){} Object.assign(NET,{role:null,via:null,connected:false,room:null,peers:{},roster:[],offset:0,stage:null,roomInfo:null,sentFriend:new Set(),opLog:[],opSeqs:new Set()}); $("#netOverlay").hidden=true; }
function netCard(html){ $("#netCard").innerHTML=html; $("#netOverlay").hidden=false; }
document.getElementById("netCard").addEventListener("click", e => { const b=e.target.closest("[data-net]"); if(!b) return; const a=b.dataset.net;
  if(a==="cancel"){ netClose(); }
  else if(a==="visible"){ Link.btDiscoverable().catch(()=>toast("Não foi possível deixar o aparelho visível.")); }
  else if(a==="retry" && NET.lastJoin){ const j=NET.lastJoin; j.via==="tcp"?joinByIp(j.ip):joinByBt(j.addr,j.name); }
  else if(a==="start"){ if(NET.roster.length>=needPlayers(NET.mode)-1) startNetSeries(); }
});
function sanitizeImgs(x){ const ok=v=>typeof v==="string"&&v.startsWith("data:image/")&&v.length<200000?v:null;
  return {plates:(Array.isArray(x?.plates)?x.plates:[]).slice(0,MAX_PLATES).map(ok), core:ok(x?.core), tomb:ok(x?.tomb)}; }

async function ensureBt(){
  try{
    let st=await Link.btStatus(); if(!st.available){ toast("Este aparelho não tem Bluetooth."); return false; }
    if(!st.granted){ const r=await Link.btPermissions(); if(!r.granted){ toast("Sem a permissão de Bluetooth não dá para jogar por Bluetooth."); return false; } }
    st=await Link.btStatus(); if(!st.enabled){ await Link.btEnable(); toast("Ligue o Bluetooth e toque de novo."); return false; }
    return true;
  }catch(e){ toast(e?.message||"Bluetooth indisponível."); return false; }
}
function hostCard(){
  const R=NET.room, need=needPlayers(NET.mode), have=NET.roster.length+1;
  const where = NET.via==="tcp"
    ? `<p style="margin:0">Peça para os outros jogadores digitarem este IP em <b>Jogar → Entrar pelo IP</b>:</p><p class="bigip num">${esc(R.ip)}</p>`
    : `<p style="margin:0">Os outros jogadores tocam em <b>Procurar sala por Bluetooth</b> e escolhem:</p><p class="bigip">${esc(R.btName||"este aparelho")}</p><p class="muted" style="margin:0;font-size:13px">Se os aparelhos ainda não foram pareados, deixe este visível.</p>`;
  const names=[me.name,...NET.roster.map(x=>x.name)];
  const teams = NET.mode==="2x2" ? `<div class="teams"><div><span class="label">Time A</span><b>${esc(names[0])}</b><b>${esc(names[2]||"aguardando…")}</b></div><div><span class="label">Time B</span><b>${esc(names[1]||"aguardando…")}</b><b>${esc(names[3]||"aguardando…")}</b></div></div>` : "";
  netCard(`<span class="label">Sala ${NET.mode==="2x2"?"2 x 2":"1 x 1"} aberta ${NET.via==="tcp"?"no Wi-Fi":"por Bluetooth"}</span><h2 style="font-size:24px">${esc(R.title)}</h2>${where}
    ${teams}<p class="muted" style="margin:0;font-size:13px">Turnos de ${fmtS(R.turnSec)}${R.hasPass?" · com senha":""} · ${have} de ${need} jogadores</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${NET.via==="bt"?`<button class="btn" data-net="visible">Ficar visível</button>`:""}${NET.mode==="2x2"?`<button class="btn primary" data-net="start" ${have<need?"disabled":""}>Começar série</button>`:""}<button class="btn danger" data-net="cancel">Fechar sala</button></div>`);
}
async function hostRoom(via){
  const title=$("#nrTitle").value.trim(); if(!title){ toast("Dê um título para a sala."); $("#nrTitle").focus(); return; }
  const pass=$("#nrPass").value, turnSec=+$("#nrTurn").value, mode=document.querySelector('input[name="nrMode"]:checked')?.value||"1x1";
  STORE.lastTitle=title; STORE.lastTurn=turnSec; STORE.lastMode=mode; save();
  if(G && G.net && !G.series.done){ toast("Termine a série atual antes de criar outra sala."); return; }
  await netClose(); const salt=uidStr();
  NET.room={title,hasPass:!!pass,passHash:pass?await sha("tm:"+salt+":"+pass):null,salt,turnSec}; NET.role="host"; NET.via=via; NET.mode=mode; NET.stage="waiting";
  const maxPeers=needPlayers(mode)-1;
  try{
    if(via==="tcp"){
      const {ip,port}=await Link.getLocalIp(); if(!ip){ NET.role=null; netCard(`<h2>Sem Wi-Fi</h2><p>Conecte o aparelho a uma rede Wi-Fi (ou ligue o roteador/hotspot) e tente de novo.</p><button class="btn" data-net="cancel">Fechar</button>`); return; }
      await Link.tcpHost({port,maxPeers}); NET.room.ip=ip;
    } else {
      if(!(await ensureBt())){ NET.role=null; return; }
      const r=await Link.btHost({maxPeers}); NET.room.btName=r.name;
    }
    hostCard();
  }catch(e){ NET.role=null; netCard(`<h2>Não deu para abrir a sala</h2><p>${esc(e?.message||"Erro desconhecido.")}</p><button class="btn" data-net="cancel">Fechar</button>`); }
}
async function joinByIp(ip){
  if(!ip){ toast("Digite o IP da sala."); return; }
  if(G && G.net && !G.series.done && NET.connected){ toast("Você já está numa série."); return; }
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

/* ---- eventos da conexão ---- */
Link.addListener("btDevice", d => { if(!d?.address || btFound.some(x=>x.address===d.address)) return; btFound.push({name:d.name,address:d.address,paired:false}); renderBtList(true); });
Link.addListener("btScanDone", () => renderBtList(false));
Link.addListener("connected", d => {
  if(NET.role==="host"){ NET.peers[d.peer]={name:null,side:null,addr:d.address||null,connected:true};
    const R=NET.room; netSend({t:"room",v:PROTO,title:R.title,hasPass:R.hasPass,salt:R.salt,turnSec:R.turnSec,host:me.name,mode:NET.mode,have:NET.roster.length+1},d.peer); }
  else { NET.connected=true; NET.peerAddr=d.address||null; netSend({t:"ping",t0:Date.now()}); }
  renderNetBanner();
});
Link.addListener("disconnected", d => {
  if(NET.role==="host"){
    const p=NET.peers[d.peer]; if(!p) return; p.connected=false;
    if(G && G.net && !G.series.done && p.side){ toast(`${p.name||"Um jogador"} desconectou. A sala continua aberta para ele voltar.`); }
    else { NET.roster=NET.roster.filter(x=>x.peer!==d.peer); delete NET.peers[d.peer]; if(NET.stage==="waiting"){ sendLobby(); hostCard(); } }
  } else if(NET.role==="guest"){
    const wasPlaying = G && G.net && !G.series.done; NET.connected=false;
    if(wasPlaying){ toast("Conexão perdida com a sala."); }
    else if(NET.stage && NET.stage!=="connecting"){ netCard(`<h2>Conexão encerrada</h2><p>${esc(d?.reason||"A sala foi fechada.")}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" data-net="retry">Tentar de novo</button><button class="btn ghost" data-net="cancel">Fechar</button></div>`); }
  }
  renderNetBanner();
});
Link.addListener("error", d => toast(d?.message||"Erro de conexão."));
Link.addListener("data", d => { let m; try{ m=JSON.parse(d.line); }catch(e){ return; } NET.role==="host" ? onHostMsg(m,d.peer) : onGuestMsg(m); });

function sendLobby(){ const names=[me.name,...NET.roster.map(x=>x.name)]; forward({t:"lobby",names,need:needPlayers(NET.mode),mode:NET.mode}); }
function onHostMsg(m,peer){
  const P=NET.peers[peer]; if(!P) return;
  if(m.t==="ping") netSend({t:"pong",t0:m.t0,th:Date.now()},peer);
  else if(m.t==="join"){
    const name=String(m.name||"").slice(0,16), k=keyOf(name);
    const reject=(msg,drop)=>{ netSend({t:"reject",msg},peer); if(drop) setTimeout(()=>Link.disconnect({peer}).catch(()=>{}),300); };
    if(G && G.net && !G.series.done){
      const side=G.order.find(s=>s!==mySide && keyOf(G.players[s].name)===k);
      if(!side) return reject("Essa sala já está numa série.",true);
      P.name=name; P.side=side; netSend({t:"start",g:G},peer);
      for(const s of G.order) if(s!==side && IMGS[s]) netSend({t:"imgs",side:s,imgs:IMGS[s]},peer);
      toast(`${name} voltou à série.`); renderNetBanner(); return;
    }
    if(NET.room.hasPass && m.pass!==NET.room.passHash) return reject("Senha da sala incorreta.");
    if(k===me.key || NET.roster.some(x=>keyOf(x.name)===k)) return reject("Já tem alguém com esse nome na sala. Entre com outra conta.",true);
    if(NET.roster.length>=needPlayers(NET.mode)-1) return reject("A sala está cheia.",true);
    P.name=name; NET.roster.push({peer,name,arsenal:m.arsenal});
    sendLobby(); hostCard();
    if(NET.mode==="1x1") startNetSeries();
  }
  else if(m.t==="imgs" && G && P.side){ IMGS[P.side]=sanitizeImgs(m.imgs); forward({t:"imgs",side:P.side,imgs:IMGS[P.side]},peer); renderBoard(); }
  else if(m.t==="op" && m.op==="fuse" && G && P.side && m.side===P.side && Array.isArray(m.ids) && m.ids.length===3){ hostFuse(m.side,+m.i,m.ids.map(String)); }
  else if(m.t==="state" && G && G.net && m.g && m.g.roomId===G.roomId){
    if((m.g.seq||0)>(G.seq||0)){ applyRemote(m.g); forward({t:"state",g:m.g},peer); }
    else { // a jogada veio de uma versão sem as fusões feitas fora da vez: reaplica essas fusões em cima dela
      let ok=true; for(let q=m.g.seq; q<=G.seq; q++) if(!NET.opSeqs.has(q)) ok=false;
      if(ok){ const g=clone(m.g); for(const o of NET.opLog) if(o.seq>=m.g.seq) applyFuse(g,o.side,o.i,o.ids); g.seq=G.seq+1; applyRemote(g); forward({t:"state",g}); } } }
  else if(m.t==="friend"||m.t==="friendOk"){
    if(keyOf(m.to)===me.key) onFriendMsg(m, {ip:NET.via==="tcp"?P.addr:null, bt:NET.via==="bt"?P.addr:null});
    else { const to=peerByName(m.to); if(to) netSend(m,to); }
  }
}
function onGuestMsg(m){
  if(m.t==="room"){
    NET.roomInfo=m; NET.stage="room"; NET.peerName=m.host; NET.mode=m.mode||"1x1";
    if(m.v!==PROTO){ netCard(`<h2>Versões diferentes</h2><p>O app de quem criou a sala é de outra versão. Atualizem todos os aparelhos.</p><button class="btn" data-net="cancel">Fechar</button>`); return; }
    if(G && G.net && !G.series.done && G.players.p1.name===m.host){ netSend({t:"join",name:me.name,pass:null,resume:true}); netCard(`<h2>Reconectando…</h2><p>Voltando à série de ${esc(m.host)}.</p>`); return; }
    netCard(`<span class="label">Sala ${NET.mode==="2x2"?"2 x 2":"1 x 1"} de ${esc(m.host)}</span><h2 style="font-size:24px">${esc(m.title)}</h2><p class="muted" style="margin:0">Turnos de ${fmtS(m.turnSec)} · ${m.have} de ${needPlayers(NET.mode)} jogadores</p>
      <form id="roomJoinF" style="display:grid;gap:10px">${m.hasPass?`<div class="field"><label class="label" for="rjPass">Senha da sala</label><input id="rjPass" type="password" required></div>`:""}
      <div class="err" id="rjErr"></div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${!isFriendName(m.host)?`<button class="btn ghost" type="button" id="rjFriend">+ Adicionar ${esc(m.host)}</button>`:""}<button class="btn primary" type="submit">Entrar</button><button class="btn ghost" type="button" data-net="cancel">Sair</button></div></form>`);
    const f=document.getElementById("rjFriend"); if(f) f.onclick=()=>{ sendFriendReq(m.host); f.hidden=true; };
    $("#roomJoinF").onsubmit=async e=>{ e.preventDefault(); const p=document.getElementById("rjPass")?.value||""; NET.stage="joining";
      netSend({t:"join",name:me.name,pass:m.hasPass?await sha("tm:"+m.salt+":"+p):null,arsenal:publicArsenal(myArsenal())}); };
  }
  else if(m.t==="pong"){ const now=Date.now(); NET.offset = m.th - (m.t0+now)/2; }
  else if(m.t==="lobby" && NET.stage!=="playing"){ NET.stage="lobby";
    const n=m.names, teams=m.mode==="2x2"?`<div class="teams"><div><span class="label">Time A</span><b>${esc(n[0])}</b><b>${esc(n[2]||"aguardando…")}</b></div><div><span class="label">Time B</span><b>${esc(n[1]||"aguardando…")}</b><b>${esc(n[3]||"aguardando…")}</b></div></div>`:"";
    netCard(`<span class="label">Sala de ${esc(n[0])}</span><h2 style="font-size:24px">Aguardando jogadores</h2>${teams}<p class="muted" style="margin:0">${n.length} de ${m.need} jogadores. ${m.mode==="2x2"?`${esc(n[0])} começa a série quando todos entrarem.`:""}</p><button class="btn ghost" data-net="cancel">Sair da sala</button>`); }
  else if(m.t==="reject"){ NET.stage="room"; const er=document.getElementById("rjErr"); if(er) er.textContent=m.msg; else netCard(`<h2>Não deu para entrar</h2><p>${esc(m.msg)}</p><button class="btn" data-net="cancel">Fechar</button>`); }
  else if(m.t==="start"){ NET.stage="playing"; $("#netOverlay").hidden=true; openNetGame(m.g); IMGS[mySide]=myImgs(); netSend({t:"imgs",imgs:IMGS[mySide]}); }
  else if(m.t==="imgs" && m.side){ IMGS[m.side]=sanitizeImgs(m.imgs); if(G) renderBoard(); }
  else if(m.t==="state" && G && G.net && m.g && m.g.roomId===G.roomId && (m.g.seq||0)>(G.seq||0)){ applyRemote(m.g); }
  else if((m.t==="friend"||m.t==="friendOk") && keyOf(m.to)===me.key){ onFriendMsg(m, keyOf(m.from)===keyOf(NET.peerName) ? (NET.via==="tcp"?{ip:NET.lastJoin?.ip}:{bt:NET.lastJoin?.addr,btName:NET.lastJoin?.name}) : {}); }
}
function startNetSeries(){
  const R=NET.room, need=needPlayers(NET.mode); if(NET.roster.length<need-1) return;
  const players=[{key:me.key,name:me.name,arsenal:publicArsenal(myArsenal())},...NET.roster.slice(0,need-1).map(x=>({key:keyOf(x.name),name:x.name,arsenal:x.arsenal}))];
  const g=newSeries("net-"+Date.now(),{title:R.title,turnSec:R.turnSec},NET.mode,players,genCombos()); g.net=true; g.via=NET.via;
  NET.roster.slice(0,need-1).forEach((x,i)=>{ const p=NET.peers[x.peer]; if(p) p.side=g.order[i+1]; });
  IMGS={p1:myImgs()};
  NET.stage="playing"; $("#netOverlay").hidden=true; forward({t:"start",g}); openNetGame(g); forward({t:"imgs",side:"p1",imgs:IMGS.p1});
}
/* ---- amizade: convites passam por quem criou a sala ---- */
function sendFriendReq(to){ if(NET.role==="guest"&&!NET.connected || NET.role==="host"&&!peerByName(to)) return toast("Sem conexão com esse jogador.");
  const msg={t:"friend",from:me.name,to}; if(NET.role==="host") netSend(msg,peerByName(to)); else netSend(msg);
  NET.sentFriend.add(keyOf(to)); toast(`Convite de amizade enviado para ${to}.`); if(G) renderCards(); }
function onFriendMsg(m,contact){
  const nm=String(m.from||"").slice(0,16); if(!nm) return;
  if(m.t==="friendOk"){ addFriendLocal({name:nm,...contact}); STORE.invites[me.key]=myInvites().filter(v=>keyOf(v.name)!==keyOf(nm)); save(); renderInvitesBadge(); toast(`${nm} aceitou. Agora vocês são amigos.`); if(G) renderCards(); return; }
  const reply=()=>{ const r={t:"friendOk",from:me.name,to:nm}; if(NET.role==="host") netSend(r,peerByName(nm)); else netSend(r); };
  if(isFriendName(nm)){ reply(); return; }
  const inv=myInvites(); if(!inv.some(v=>keyOf(v.name)===keyOf(nm))) inv.push({name:nm,...contact,at:Date.now()}); save(); renderInvitesBadge();
  modal(`<h2>Convite de amizade</h2><p><b>${esc(nm)}</b> quer ser seu amigo.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn primary" id="fpOk">Aceitar</button><button class="btn ghost" id="fpNo">Depois</button></div>`);
  $("#fpOk").onclick=()=>{ const v=myInvites().find(x=>keyOf(x.name)===keyOf(nm)); STORE.invites[me.key]=myInvites().filter(x=>x!==v); addFriendLocal(v||{name:nm,...contact}); save(); renderInvitesBadge(); reply(); closeModal(); toast(`${nm} agora é seu amigo.`); if(G) renderCards(); if(view==="friends") renderPanel(); };
  $("#fpNo").onclick=closeModal;
}
function renderNetBanner(){
  const B=$("#gNetBanner"), L=$("#gLink"); if(!G||!G.net){ B.hidden=true; L.hidden=true; return; }
  const ok = NET.role==="guest" ? NET.connected : Object.values(NET.peers).some(p=>p.connected&&p.side);
  L.hidden=false; L.innerHTML=`<span class="dot ${ok?"on":""}"></span>${G.via==="bt"?"Bluetooth":"Wi-Fi"}`;
  const away = NET.role==="host" ? G.order.filter(s=>s!==mySide && !Object.values(NET.peers).some(p=>p.connected&&p.side===s)).map(s=>G.players[s].name) : [];
  if(G.series.done || (NET.role==="guest" ? NET.connected : !away.length)){ B.hidden=true; return; }
  B.hidden=false;
  B.innerHTML = NET.role==="host"
    ? `<div class="grow"><b>${esc(away.join(", "))} ${away.length>1?"estão":"está"} fora da sala.</b> A sala continua aberta para voltar${G.mode==="2x2"?"; a vez de quem está fora passa sozinha quando o tempo acaba":""}.</div>`
    : `<div class="grow"><b>Conexão perdida.</b> ${G.mode==="2x2"?"A série continua para os outros; volte o quanto antes.":"O duelo fica pausado até você voltar."}</div><button class="btn sm gold" id="nbRetry">Reconectar</button>`;
  const r=document.getElementById("nbRetry"); if(r) r.onclick=()=>{ const j=NET.lastJoin; if(!j) return; j.via==="tcp"?reconnectIp(j.ip):reconnectBt(j.addr,j.name); };
}
async function reconnectIp(ip){ NET.role="guest"; NET.via="tcp"; toast("Reconectando…"); try{ await Link.tcpJoin({ip}); }catch(e){ toast(e?.message||"Não foi possível reconectar."); } }
async function reconnectBt(addr,name){ NET.role="guest"; NET.via="bt"; toast("Reconectando…"); try{ await Link.btJoin({address:addr}); }catch(e){ toast(e?.message||"Não foi possível reconectar."); } }

/* conexão simulada para testar no navegador (várias abas no mesmo computador) */
function makeSimLink(){
  const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("tm-sim") : null;
  const id = Math.random().toString(36).slice(2); let hosting=false, maxPeers=1, host=null; const peers=new Set(), ls={};
  const emit=(ev,d)=>(ls[ev]||[]).forEach(f=>f(d));
  const post=m=>ch&&ch.postMessage({...m,from:id});
  let pendingJoin=null;
  ch && (ch.onmessage = ({data:m}) => {
    if(m.to && m.to!==id) return;
    if(m.k==="hello" && hosting && !m.to && peers.size<maxPeers && !pendingJoin){ peers.add(m.from); post({k:"accept",to:m.from}); emit("connected",{via:"sim",address:"127.0.0.1",peer:m.from}); }
    else if(m.k==="accept" && pendingJoin){ host=m.from; const r=pendingJoin; pendingJoin=null; emit("connected",{via:"sim",address:"127.0.0.1",peer:m.from}); r(); }
    else if(m.k==="data" && (peers.has(m.from)||m.from===host)) emit("data",{line:m.data,peer:m.from});
    else if(m.k==="bye"){ if(peers.delete(m.from)) emit("disconnected",{peer:m.from,reason:"O jogador saiu."}); else if(m.from===host){ host=null; emit("disconnected",{peer:m.from,reason:"A sala foi fechada."}); } }
  });
  const join=()=>new Promise((res,rej)=>{ maxPeers=1; pendingJoin=res; post({k:"hello"}); setTimeout(()=>{ if(pendingJoin){ pendingJoin=null; rej({message:"Não encontrei uma sala nesse IP. (modo de teste: abra a sala em outra aba)"}); } },1500); });
  return {
    addListener(ev,f){ (ls[ev] ||= []).push(f); return {remove(){}}; },
    async getLocalIp(){ return {ip:"127.0.0.1",port:47800}; },
    async tcpHost(o){ hosting=true; maxPeers=o?.maxPeers||1; }, async btHost(o){ hosting=true; maxPeers=o?.maxPeers||1; return {name:"Aparelho de teste"}; },
    tcpJoin: join, btJoin: join,
    async btStatus(){ return {available:true,enabled:true,granted:true}; }, async btPermissions(){ return {granted:true}; },
    async btEnable(){}, async btDiscoverable(){}, async btPaired(){ return {devices:[{name:"Aparelho de teste",address:"SIM"}]}; },
    async btScan(){ setTimeout(()=>emit("btScanDone",{}),300); },
    async send({data,peer}){ const targets = hosting ? (peer?[peer]:[...peers]) : (host?[host]:[]); if(!targets.length) throw {message:"Sem conexão."}; for(const t of targets) post({k:"data",to:t,data}); },
    async disconnect(o){ const list=o?.peer?[o.peer]:hosting?[...peers]:(host?[host]:[]); for(const t of list){ post({k:"bye",to:t}); if(peers.delete(t)||t===host){ if(t===host) host=null; emit("disconnected",{peer:t,reason:"Conexão encerrada."}); } } },
    async close(){ for(const t of peers) post({k:"bye",to:t}); if(host) post({k:"bye",to:host}); peers.clear(); host=null; hosting=false; }
  };
}

/* ================= sincronização da série ================= */
function openNetGame(g){
  G=clone(g); gameId=g.roomId; mySide = G.order.find(s=>keyOf(G.players[s].name)===me.key) || null; fxSeen=G.fx?.seq;
  sel=inspect=selScroll=null; pending=[]; spinning={}; histOpen=false;
  showScreen("game"); $("#endOverlay").hidden=true; renderGame(); renderNetBanner();
  if(G.status==="finished") onFinished();
}
function applyRemote(g){
  const prev=G; G=clone(g);
  if((prev.turn!==G.turn || prev.series.round!==G.series.round) && G.turn===mySide && G.status==="playing") toast("Sua vez!");
  if(prev.turnNo!==G.turnNo || prev.series.round!==G.series.round){ spinning={}; pending=[]; selScroll=null; sel=null; inspect=null; }
  if(G.status==="playing") $("#endOverlay").hidden=true;
  if(!$("#scr-game").hidden) renderGame(); if(G.status==="finished" && prev.status!=="finished") onFinished();
}
$("#gBack").onclick = () => { $("#endOverlay").hidden=true;
  if(G && G.net && G.series.done){ netClose(); G=null; }
  else if(G && G.ai){ G=null; }
  showScreen("lobby"); renderProfile(); renderPanel(); };
const isMyTurn = () => G && G.status==="playing" && G.turn===mySide && !G.out?.[mySide] && netOk();
async function commit(fn){
  if(busy||!G) return; if(G.net && !netOk()){ toast("Sem conexão com os outros jogadores. A jogada não foi feita."); return; }
  busy=true;
  try{ const g=clone(G), now=gnow(); settle(g,now); g.fx={seq:(G.fx?.seq||0)+1,items:[]};
    if(fn(g,now)===false) return;
    if(!g.fx.items.length) g.fx=G.fx||{seq:0,items:[]};
    g.updatedAt=now; g.seq=(g.seq||0)+1; const was=G.status; G=g; renderGame();
    if(g.ai){ aiGame=g; if(g.status==="finished"&&was!=="finished") onFinished(); else setTimeout(maybeAi,0); return; }
    if(g.net){ await netSend({t:"state",g}); if(g.status==="finished"&&was!=="finished") onFinished(); }
  } finally { busy=false; }
}
/* fusão: na própria vez (ou contra a IA) aplica direto; fora da vez, quem criou a sala aplica e repassa */
async function commitRetry(fn){ for(let i=0;i<80&&busy;i++) await wait(40); return commit(fn); }
async function fuseNow(side,i,ids){
  if(!G.net || G.turn===side){ await commitRetry(g=>applyFuse(g,side,i,ids)); return; }
  if(NET.role==="host") return hostFuse(side,i,ids);
  netSend({t:"op",op:"fuse",side,i,ids});
}
async function hostFuse(side,i,ids){
  const before=G.seq; await commitRetry(g=>applyFuse(g,side,i,ids));
  if(G.seq>before){ NET.opLog.push({seq:G.seq,side,i,ids}); NET.opSeqs.add(G.seq); if(NET.opLog.length>60) NET.opLog.shift(); }
}
$("#gPass").onclick = () => { if(!isMyTurn()) return toast("Espere a sua vez."); const tn=G.turnNo; commit((g,now)=>{ if(g.turnNo!==tn) return false; endTurn(g,now,"passou"); }); };
$("#gQuit").onclick = () => { if(G?.status==="playing" && mySide && !G.out?.[mySide]) $("#confirmQuit").hidden=false; };
$("#cqNo").onclick = () => $("#confirmQuit").hidden=true;
$("#cqYes").onclick = () => { $("#confirmQuit").hidden=true; const side=mySide;
  const quit=(g,now)=>{ if(g.status!=="playing"||g.out[side]) return false; const wasTurn=g.turn===side;
    eliminate(g,side,`${g.players[side].name} desistiu deste duelo.`); if(g.status==="playing" && wasTurn) endTurn(g,now,"passou"); };
  if(G.net && !netOk()){ quit(G,gnow()); renderGame(); if(G.status==="finished") onFinished(); return; }
  commit(quit); };
function nextRound(){
  commit((g,now)=>{ if(g.status!=="finished"||g.series.done) return false; g.series.round++; startRound(g,now); });
  $("#endOverlay").hidden=true; sel=inspect=selScroll=null; pending=[]; spinning={};
}
function onFinished(){
  const S=G.series, mt=myTeam(), ot=otherTeam(mt), wonRound=G.winner===mt, o=$("#endOverlay");
  const score=`<p class="bigip num" style="margin:0">${S.score[mt]} x ${S.score[ot]}</p>`;
  const vs=`<p class="muted" style="margin:0">${esc(teamName(G,mt))} x ${esc(teamName(G,ot))}</p>`;
  if(S.done){
    const won=S.winner===mt;
    o.innerHTML=`<div class="card"><span class="label">Fim da série · melhor de 3</span><h2>${won?"Vitória na série!":"Série perdida"}</h2>${score}${vs}<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="eoView">Ver tabuleiro</button><button class="btn primary" id="eoBack">Voltar ao menu</button></div></div>`;
    const key=G.roomId+":serie"; if(!finishedHandled[key]&&mySide){ finishedHandled[key]=1; if(won) me.wins=(me.wins||0)+1; else me.losses=(me.losses||0)+1; save(); renderProfile(); }
  } else {
    o.innerHTML=`<div class="card"><span class="label">Duelo ${S.round} de no máximo 3</span><h2>${wonRound?"Duelo vencido!":"Duelo perdido"}</h2>${score}${vs}<p style="margin:0">${S.score[mt]>S.score[ot]?"Mais uma vitória fecha a série.":S.score[mt]<S.score[ot]?"Vença o próximo para empatar a série.":"Série empatada: o próximo duelo decide."} As combinações de cristais continuam as mesmas.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="eoView">Ver tabuleiro</button><button class="btn primary" id="eoNext">Próximo duelo</button></div></div>`;
  }
  o.hidden=false;
  const b=$("#eoBack"); if(b) b.onclick=()=>{ o.hidden=true; $("#gBack").click(); };
  const n=$("#eoNext"); if(n) n.onclick=()=>{ if(G.net&&!netOk()) return toast("Sem conexão com os outros jogadores."); nextRound(); };
  $("#eoView").onclick=()=>o.hidden=true;
}
setInterval(()=>{
  if(!G||$("#scr-game").hidden) return; renderClock();
  if(G.status!=="playing"||!mySide||busy) return; if(G.net && !netOk()) return;
  const now=gnow(), tn=G.turnNo, key=G.roomId+":"+G.series.round+":"+tn;
  const mine = G.turn===mySide, aiTurnNow = G.ai && G.turn==="p2";
  // pergaminho de feitiço: quem está jogando (ou a IA) coloca no tabuleiro
  if(now>=G.spellNext && (mine||aiTurnNow)){ commit((g,n)=>{ if(n<g.spellNext||g.status!=="playing") return false; spawnSpell(g,n); }); return; }
  const late = mine ? now>G.turnEndsAt : now>G.turnEndsAt+5000;
  const iDecide = mine || !G.net || G.mode==="1x1" || NET.role==="host";
  if(late && iDecide && !timeoutSent[key]){ timeoutSent[key]=1; commit((g,n)=>{ if(g.turnNo!==tn||g.status!=="playing") return false; endTurn(g,n,"tempo"); }); }
},500);
setInterval(()=>{ if(G && !$("#scr-game").hidden){ renderBoard(); renderCards(); renderExplain(); renderScrolls(); } },1000);

/*@@GAME_CORE@@*/

/* ================= boot ================= */
(async function boot(){
  showScreen("login");
  await loadStore();
  if(STORE.session && STORE.accounts[STORE.session]) enter(STORE.accounts[STORE.session]);
  if(!NATIVE) console.info("Tabuleiro Mágico: modo navegador — a conexão é simulada entre abas.");
  if(!NATIVE) window.__tm = { G:()=>G, V:()=>V(), commit, endRound, cdLeft, pieceCd, gnow, myArsenal };
})();
