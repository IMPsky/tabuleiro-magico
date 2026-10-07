/* ================= state ================= */
let me = null, view = "home", IMGS = {p1:[],p2:[]};
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
  if(G && G.net && !G.series.done && $("#scr-game").hidden) h+=`<div class="banner"><div class="grow"><b>Série em andamento</b> contra ${esc(G.players[other(mySide)].name)}.</div><button class="btn gold sm" data-act="resumeNet">Voltar ao duelo</button></div>`;
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
  else arsenalClick(a,b,i);
});
function addFriendLocal(v){ const fr=myFriends(); const ex=fr.find(f=>keyOf(f.name)===keyOf(v.name)); const rec={name:v.name, ip:v.ip||ex?.ip||null, bt:v.bt||ex?.bt||null, btName:v.btName||ex?.btName||null, at:Date.now()}; if(ex) Object.assign(ex,rec); else fr.push(rec); }
function setAvatar(file){
  if(!file) return; const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{ const c=document.createElement("canvas"); c.width=c.height=112; const x=c.getContext("2d"); const s=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,112,112); URL.revokeObjectURL(url); me.avatar=c.toDataURL("image/jpeg",.8); save(); renderProfile(); renderPanel(); toast("Foto atualizada."); };
  img.onerror=()=>toast("Esse arquivo não é uma imagem válida."); img.src=url;
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
    <p class="muted" style="margin:0;max-width:66ch">Dê nome e imagem às suas placas de pedra e distribua os pontos entre os atributos. Só as placas marcadas como <b>em campo</b> entram no duelo e gastam pontos. Elas ocupam o tabuleiro nesta ordem:</p>
    <div class="ap-grid" aria-label="Posição das placas no seu lado do tabuleiro">${preview}</div>
    <div class="plates">${ars.map((pl,i)=>{ const st=plateStats(pl);
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
  const ars=myArsenal(); const pl=ars[i];
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
  else if(t.dataset.file!=null && t.files?.[0]){ try{ ars[+t.dataset.file].img=await shrinkImage(t.files[0],96); save(); renderPanel(); }catch(err){ toast(err.message); } }
});
document.getElementById("panel").addEventListener("input", e => { if(me && view==="arsenal" && e.target.dataset.name!=null){ myArsenal()[+e.target.dataset.name].name=e.target.value.slice(0,20); save(); } });

/* ================= conexão entre aparelhos ================= */
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const Link = NATIVE ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Link") : window.Capacitor.Plugins.Link) : makeSimLink();
const NET = {role:null, via:null, connected:false, room:null, peerAddr:null, peerName:null, offset:0, lastJoin:null, btName:null, stage:null, roomInfo:null, sentFriend:false};
const PROTO = 2;
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
  if(G && G.net && !G.series.done){ toast("Termine a série atual antes de criar outra sala."); return; }
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
  const wasPlaying = G && G.net && !G.series.done;
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
    if(G && G.net && !G.series.done && G.players.p1.name===m.host){ netSend({t:"join",name:me.name,pass:null,resume:true}); netCard(`<h2>Reconectando…</h2><p>Voltando ao duelo contra ${esc(m.host)}.</p>`); return; }
    netCard(`<span class="label">Sala de ${esc(m.host)}</span><h2 style="font-size:24px">${esc(m.title)}</h2><p class="muted" style="margin:0">Turnos de ${fmtS(m.turnSec)}</p>
      <form id="roomJoinF" style="display:grid;gap:10px">${m.hasPass?`<div class="field"><label class="label" for="rjPass">Senha da sala</label><input id="rjPass" type="password" required></div>`:""}
      <div class="err" id="rjErr"></div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${!isFriendName(m.host)?`<button class="btn ghost" type="button" id="rjFriend">+ Adicionar amigo</button>`:""}<button class="btn primary" type="submit">Entrar no duelo</button><button class="btn ghost" type="button" data-net="cancel">Sair</button></div></form>`);
    const f=document.getElementById("rjFriend"); if(f) f.onclick=()=>sendFriendReq();
    $("#roomJoinF").onsubmit=async e=>{ e.preventDefault(); const p=document.getElementById("rjPass")?.value||""; NET.stage="joining";
      netSend({t:"join",name:me.name,pass:m.hasPass?await sha("tm:"+m.salt+":"+p):null,arsenal:publicArsenal(myArsenal())}); };
  }
  else if(m.t==="ping" && NET.role==="host"){ netSend({t:"pong",t0:m.t0,th:Date.now()}); }
  else if(m.t==="pong" && NET.role==="guest"){ const now=Date.now(); NET.offset = m.th - (m.t0+now)/2; }
  else if(m.t==="join" && NET.role==="host"){
    const name=String(m.name||"").slice(0,16); NET.peerName=name;
    if(G && G.net && !G.series.done){
      if(keyOf(G.players.p2.name)===keyOf(name)){ netSend({t:"start",g:G}); sendImgs(); toast(`${name} voltou ao duelo.`); renderNetBanner(); return; }
      netSend({t:"reject",msg:"Essa sala já está num duelo."}); setTimeout(()=>Link.disconnect().catch(()=>{}),300); return;
    }
    if(NET.room.hasPass && m.pass!==NET.room.passHash){ netSend({t:"reject",msg:"Senha da sala incorreta."}); return; }
    if(keyOf(name)===me.key){ netSend({t:"reject",msg:"Você está usando o mesmo nome de quem criou a sala. Entre com outra conta."}); setTimeout(()=>Link.disconnect().catch(()=>{}),300); return; }
    const g=newSeries("net-"+Date.now(),{title:NET.room.title,turnSec:NET.room.turnSec},me,{key:keyOf(name),name},publicArsenal(myArsenal()),m.arsenal,genCombos()); g.net=true; g.via=NET.via;
    IMGS={p1:myArsenal().filter(x=>x.on).slice(0,MAX_PLATES).map(x=>x.img||null),p2:[]};
    netSend({t:"start",g}); NET.stage="playing"; $("#netOverlay").hidden=true; openNetGame(g); sendImgs();
  }
  else if(m.t==="reject" && NET.role==="guest"){ NET.stage="room"; const er=document.getElementById("rjErr"); if(er) er.textContent=m.msg; else netCard(`<h2>Não deu para entrar</h2><p>${esc(m.msg)}</p><button class="btn" data-net="cancel">Fechar</button>`); }
  else if(m.t==="start" && NET.role==="guest"){ NET.stage="playing"; $("#netOverlay").hidden=true;
    IMGS.p2=myArsenal().filter(x=>x.on).slice(0,MAX_PLATES).map(x=>x.img||null); openNetGame(m.g); sendImgs(); }
  else if(m.t==="imgs"){ const side=G&&keyOf(G.players.p1.name)===keyOf(m.name)?"p1":"p2"; IMGS[side]=(Array.isArray(m.imgs)?m.imgs:[]).slice(0,MAX_PLATES).map(x=>typeof x==="string"&&x.startsWith("data:image/")?x:null); if(G) renderBoard(); }
  else if(m.t==="state" && G && G.net && m.g && m.g.roomId===G.roomId && (m.g.seq||0)>(G.seq||0)){ applyRemote(m.g); }
  else if(m.t==="friend"){ const nm=String(m.name||"").slice(0,16); if(isFriendName(nm)) { netSend({t:"friendOk",name:me.name}); return; }
    const inv=myInvites(); if(!inv.some(v=>keyOf(v.name)===keyOf(nm))) inv.push({name:nm,...peerContact(),at:Date.now()}); save(); renderInvitesBadge();
    showFriendPrompt(nm); }
  else if(m.t==="friendOk"){ const nm=String(m.name||"").slice(0,16); addFriendLocal({name:nm,...peerContact()}); STORE.invites[me.key]=myInvites().filter(v=>keyOf(v.name)!==keyOf(nm)); save(); renderInvitesBadge(); toast(`${nm} aceitou. Agora vocês são amigos.`); if(G) renderCards(); }
  else if(m.t==="leave"){ toast(`${NET.peerName||"O oponente"} saiu da sala.`); }
}
function sendImgs(){ if(!G||!mySide) return; netSend({t:"imgs",name:me.name,imgs:IMGS[mySide]||[]}); }
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
  if(NET.connected || G.series.done){ B.hidden=true; return; }
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

/* ================= game: série melhor de 3 ================= */
function buildPieces(g){
  const pieces=[]; let n=0;
  for(const side of ["p1","p2"]){
    const row=r=>side==="p1"?r:7-r;
    pieces.push({id:"k"+(n++),owner:side,type:"nucleo",plate:-1,name:"",st:{vida:g.rules.nucleoVidaBase,forca:0,atq:0,andar:0,intervalo:0},r:row(CORE_POS[0]),c:CORE_POS[1],hp:g.rules.nucleoVidaBase,maxHp:g.rules.nucleoVidaBase,element:null,cdUntil:0,sealHp:0,dead:false});
    g.arsenals[side].forEach((pl,i)=>{ const st=plateStats(pl), [sr,sc]=SLOTS[i];
      pieces.push({id:"k"+(n++),owner:side,type:"placa",plate:i,name:pl.name||"",st,r:row(sr),c:sc,hp:st.vida,maxHp:st.vida,element:null,cdUntil:0,sealHp:0,dead:false}); });
  }
  return pieces;
}
function startRound(g,now){
  const first = g.series.round%2===1 ? "p1" : "p2";
  const emptyS=()=>[{state:"empty"},{state:"empty"},{state:"empty"}];
  Object.assign(g,{status:"playing",winner:null,turn:first,turnNo:1,turnStartedAt:now,turnEndsAt:now+g.turnSec*1000+2000,dice:freshDice(),
    structures:[],traps:[],timed:[],field:null,mana:{p1:g.rules.manaBase,p2:g.rules.manaBase},manaMax:{p1:g.rules.manaBase,p2:g.rules.manaBase},
    scrolls:{p1:emptyS(),p2:emptyS()},cds:{p1:{},p2:{}}});
  g.pieces=buildPieces(g);
  g.log=[{t:Date.now(),x:`Duelo ${g.series.round} da série. ${g.players[first].name} começa.`}];
}
function newSeries(id,r,host,guest,hostArs,guestArs,combos){
  const now=gnow();
  const g={roomId:id,title:r.title,turnSec:r.turnSec,players:{p1:{key:host.key,name:host.name},p2:{key:guest.key,name:guest.name}},
    rules:clone(RULES),combos,arsenals:{p1:sanitizeArsenal(hostArs),p2:sanitizeArsenal(guestArs)},found:{p1:[],p2:[]},
    series:{round:1,score:{p1:0,p2:0},done:false,winner:null},createdAt:now,updatedAt:now,seq:1};
  startRound(g,now); return g;
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
  if((prev.turn!==G.turn || prev.series.round!==G.series.round) && G.turn===mySide && G.status==="playing") toast("Sua vez!");
  if(prev.turnNo!==G.turnNo || prev.series.round!==G.series.round){ spinning={}; pending=[]; selScroll=null; sel=null; inspect=null; }
  if(G.status==="playing") $("#endOverlay").hidden=true;
  if(!$("#scr-game").hidden) renderGame(); if(G.status==="finished") onFinished();
}
$("#gBack").onclick = () => { $("#endOverlay").hidden=true;
  if(G && G.net && G.series.done){ netClose(); G=null; }
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
  // a recarga dos pergaminhos de quem esperava andou durante este turno
  const waited=nx, elapsed=Math.max(0,now-(g.turnStartedAt||now));
  for(const k of Object.keys(g.cds[waited])) g.cds[waited][k]=Math.max(0,g.cds[waited][k]-elapsed);
  g.turn=nx; g.turnNo++; g.turnStartedAt=now; g.turnEndsAt=now+g.turnSec*1000; g.dice=freshDice();
  g.mana[nx]=Math.min(g.manaMax[nx],g.mana[nx]+g.rules.manaPorTurno);
}
$("#gPass").onclick = () => { if(!isMyTurn()) return toast("Espere a sua vez."); const tn=G.turnNo; commit((g,now)=>{ if(g.turnNo!==tn) return false; endTurn(g,now,"passou"); }); };
$("#gQuit").onclick = () => { if(G?.status==="playing" && mySide) $("#confirmQuit").hidden=false; };
$("#cqNo").onclick = () => $("#confirmQuit").hidden=true;
$("#cqYes").onclick = () => { $("#confirmQuit").hidden=true;
  if(G.net && !NET.connected){ endRound(G,other(mySide),`${G.players[mySide].name} desistiu deste duelo.`); renderGame(); onFinished(); return; }
  commit(g=>{ if(g.status!=="playing") return false; endRound(g,other(mySide),`${g.players[mySide].name} desistiu deste duelo.`); }); };
function nextRound(){
  commit((g,now)=>{ if(g.status!=="finished"||g.series.done) return false; g.series.round++; startRound(g,now); });
  $("#endOverlay").hidden=true; sel=inspect=selScroll=null; pending=[]; spinning={};
}
function onFinished(){
  const S=G.series, me_=mySide||"p1", op=other(me_), wonRound=G.winner===me_, o=$("#endOverlay");
  const score=`<p class="bigip num" style="margin:0">${S.score[me_]} x ${S.score[op]}</p>`;
  if(S.done){
    const won=S.winner===me_;
    o.innerHTML=`<div class="card"><span class="label">Fim da série · melhor de 3</span><h2>${won?"Você venceu a série!":"Série perdida"}</h2>${score}<p class="muted" style="margin:0">${esc(G.players[me_].name)} x ${esc(G.players[op].name)}</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="eoView">Ver tabuleiro</button><button class="btn primary" id="eoBack">Voltar ao menu</button></div></div>`;
    const key=G.roomId+":serie"; if(!finishedHandled[key]){ finishedHandled[key]=1; if(won) me.wins=(me.wins||0)+1; else me.losses=(me.losses||0)+1; save(); renderProfile(); }
  } else {
    o.innerHTML=`<div class="card"><span class="label">Duelo ${S.round} de no máximo 3</span><h2>${wonRound?"Você venceu o duelo!":"Duelo perdido"}</h2>${score}<p style="margin:0">${S.score[me_]>S.score[op]?"Mais uma vitória fecha a série.":S.score[me_]<S.score[op]?"Vença o próximo para empatar a série.":"Série empatada: o próximo duelo decide."} As combinações de cristais continuam as mesmas.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="eoView">Ver tabuleiro</button><button class="btn primary" id="eoNext">Próximo duelo</button></div></div>`;
  }
  o.hidden=false;
  const b=$("#eoBack"); if(b) b.onclick=()=>{ o.hidden=true; $("#gBack").click(); };
  const n=$("#eoNext"); if(n) n.onclick=()=>{ if(G.net&&!NET.connected) return toast("Sem conexão com o oponente."); nextRound(); };
  $("#eoView").onclick=()=>o.hidden=true;
}
setInterval(()=>{
  if(!G||$("#scr-game").hidden) return; renderClock();
  if(G.status!=="playing"||!mySide) return; if(G.net && !NET.connected) return;
  const now=gnow(), tn=G.turnNo, key=G.roomId+":"+G.series.round+":"+tn;
  const late = G.turn===mySide ? now>G.turnEndsAt : now>G.turnEndsAt+5000;
  if(late && !timeoutSent[key]){ timeoutSent[key]=1; commit((g,n)=>{ if(g.turnNo!==tn||g.status!=="playing") return false; endTurn(g,n,"tempo"); }); }
},500);
setInterval(()=>{ if(G && !$("#scr-game").hidden){ renderBoard(); renderCards(); if(selScroll!=null) renderExplain(); } },1000);

/*@@GAME_CORE@@*/

/* ================= boot ================= */
(async function boot(){
  showScreen("login");
  await loadStore();
  if(STORE.session && STORE.accounts[STORE.session]) enter(STORE.accounts[STORE.session]);
  if(!NATIVE) console.info("Tabuleiro Mágico: modo navegador — a conexão é simulada entre abas.");
  if(!NATIVE) window.__tm = { G:()=>G, commit, endRound, cdLeft, gnow, myArsenal };
})();
