#!/usr/bin/env python3
"""Monta www/index.html a partir do jogo base (src/base.html), do novo código (src/app.js) e do corpo (src/body.html)."""
import re, shutil, pathlib
ROOT = pathlib.Path(__file__).parent
A = (ROOT / "src/base.html").read_text()
body = (ROOT / "src/body.html").read_text()
app = (ROOT / "src/app.js").read_text()

def between(s, a, b):
    i = s.index(a); j = s.index(b, i)
    return s[i:j]

css = between(A, "<style>", "</style>")[len("<style>"):]
svg = between(A, '<svg width="0" height="0"', "</svg>") + "</svg>"
consts = between(A, "/* ================= constants", "/* ================= state")
core = between(A, "/* ================= game: rules", "/* ================= admin")

def rep(s, a, b, count=1):
    assert s.count(a) == count, (s.count(a), a[:80])
    return s.replace(a, b)

# --- sem níveis: status iguais para todos
consts = rep(consts, "manaBase:100, nucleoVidaBase:100, porNivel:5, xpPorNivel:200, xpVitoria:60, xpDerrota:20,", "manaBase:100, nucleoVidaBase:100,")
consts = rep(consts, 'manaBase:"Mana inicial (nível 0)", nucleoVidaBase:"Vida do núcleo (nível 0)", porNivel:"Mana e vida extra por nível",\n  xpPorNivel:"Experiência por nível", xpVitoria:"XP por vitória", xpDerrota:"XP por derrota",\n',
             'manaBase:"Mana de cada duelista", nucleoVidaBase:"Vida do núcleo de cada duelista",\n')

# --- núcleo do jogo
core = core.replace("Date.now()", "gnow()")
core = rep(core, "const activeCombos = () => COMBOS.length ? COMBOS : DEFAULT_COMBOS;",
           "const activeCombos = () => (G&&G.combos) ? G.combos : (COMBOS.length ? COMBOS : DEFAULT_COMBOS);")
core = rep(core, 'const mine=side===mySide; const rel=!mine&&mySide?friendRel(pl.key):null;', 'const mine=side===mySide; const fr=!mine&&isFriendName(pl.name);')
core = rep(core, '${!mine&&mySide&&!rel&&!pl.ai&&db&&!OFFLINE?` <button class="btn sm ghost" data-addfriend="${esc(pl.key)}" data-name="${esc(pl.name)}">+ Adicionar amigo</button>`:""}${rel?.status==="accepted"?` <span class="chip">amigo</span>`:""}',
           '${!mine&&mySide&&!pl.ai&&g.net&&!fr?` <button class="btn sm ghost" data-addfriend="1">${NET.sentFriend?"Convite enviado":"+ Adicionar amigo"}</button>`:""}${fr?` <span class="chip">amigo</span>`:""}')
core = rep(core, 'const b=e.target.closest("[data-addfriend]"); if(b){ try{ await addFriend(b.dataset.addfriend,b.dataset.name);}catch(x){toast("Não foi possível enviar o convite.");} }',
           'const b=e.target.closest("[data-addfriend]"); if(b && !NET.sentFriend) sendFriendReq();')
core = rep(core, "function renderGame(){ if(!G) return; $(\"#gTitle\").textContent=G.title||\"Duelo\";",
           "function renderGame(){ if(!G) return; renderNetBanner(); $(\"#gTitle\").textContent=G.title||\"Duelo\";")

app = app.replace("/*@@GAME_CORE@@*/", core)

fonts = """
@font-face{font-family:"Marcellus SC";src:url(fonts/marcellus-sc-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Alegreya Sans";src:url(fonts/alegreya-sans-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Alegreya Sans";src:url(fonts/alegreya-sans-latin-500-normal.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:"Alegreya Sans";src:url(fonts/alegreya-sans-latin-700-normal.woff2) format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Alegreya Sans";src:url(fonts/alegreya-sans-latin-800-normal.woff2) format("woff2");font-weight:800;font-display:swap}
"""
extra = """
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
img{max-width:100%}
.bigip{font-family:var(--display);font-size:clamp(28px,9vw,44px);color:var(--gold2);margin:6px 0;overflow-wrap:anywhere}
#netOverlay,#modal{z-index:60}
#gNetBanner{margin:10px 16px 0}
"""

html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="color-scheme" content="dark">
<title>Tabuleiro Mágico</title>
<style>{fonts}{css}{extra}</style>
</head>
<body>
{body}
{svg}
<script>
(() => {{
"use strict";
{consts}
{app}
}})();
</script>
</body>
</html>
"""
www = ROOT / "www"; (www / "fonts").mkdir(parents=True, exist_ok=True)
(www / "index.html").write_text(html)
for f in ["marcellus-sc/files/marcellus-sc-latin-400-normal.woff2"] + [f"alegreya-sans/files/alegreya-sans-latin-{w}-normal.woff2" for w in (400,500,700,800)]:
    shutil.copy(ROOT / "node_modules/@fontsource" / f, www / "fonts" / pathlib.Path(f).name)
print("www/index.html:", len(html), "bytes")
