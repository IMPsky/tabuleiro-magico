#!/usr/bin/env python3
"""Monta www/index.html juntando os arquivos de src/."""
import re, shutil, pathlib
ROOT = pathlib.Path(__file__).parent
body = (ROOT / "src/body.html").read_text()
app = (ROOT / "src/app.js").read_text()
css = (ROOT / "src/style.css").read_text()
svg = (ROOT / "src/icons.svg").read_text()
consts = (ROOT / "src/consts.js").read_text()
core = (ROOT / "src/core.js").read_text()
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
(www / "img").mkdir(exist_ok=True)
for f in (ROOT / "src/img").glob("*"):
    shutil.copy(f, www / "img" / f.name)
print("www/index.html:", len(html), "bytes")
