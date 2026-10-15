"""Zet de werkruimte van Bladwerk klaar voor de losse Mac-app (map web/).

- kopieert ../bladwerk/public (zonder service worker en webmanifest)
- zet de bibliotheken (pdf.js, pdf-lib, fontkit, JSZip) erbij
- bouwt de lettertypes in, zodat de app geen internet nodig heeft
- maakt het pictogram (1024 px) voor de app
"""
import os
import re
import shutil
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
# Werkt zowel vanuit de repo (mac/ naast public/) als vanuit een losse map naast bladwerk/
_REPO = os.path.join(HIER, '..')
_LOS = os.path.join(HIER, '..', 'bladwerk')
_BASIS = _REPO if os.path.isdir(os.path.join(_REPO, 'public')) else _LOS
BRON = os.path.join(_BASIS, 'public')
NM_WEB = os.path.join(_BASIS, 'node_modules')
NM = os.path.join(HIER, 'node_modules')
WEB = os.path.join(HIER, 'web')

shutil.rmtree(WEB, ignore_errors=True)
shutil.copytree(BRON, WEB, ignore=shutil.ignore_patterns('sw.js', 'manifest.webmanifest', 'login.html'))

# Bibliotheken: dezelfde paden als op de website (/vendor/...)
V = os.path.join(WEB, 'vendor')
kopie = [
    ('pdfjs-dist/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs'),
    ('pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'),
    ('pdf-lib/dist/pdf-lib.esm.min.js', 'pdf-lib/pdf-lib.esm.min.js'),
    ('@pdf-lib/fontkit/dist/fontkit.umd.min.js', 'fontkit/fontkit.umd.min.js'),
    ('jszip/dist/jszip.min.js', 'jszip/jszip.min.js'),
]
for bron, doel in kopie:
    os.makedirs(os.path.dirname(os.path.join(V, doel)), exist_ok=True)
    shutil.copy(os.path.join(NM_WEB, bron), os.path.join(V, doel))
shutil.copytree(os.path.join(NM_WEB, 'pdfjs-dist/cmaps'), os.path.join(V, 'pdfjs/cmaps'))
shutil.copytree(os.path.join(NM_WEB, 'pdfjs-dist/standard_fonts'), os.path.join(V, 'pdfjs/standard_fonts'))

# Lettertypes: alleen Latijns schrift (met accenten), dat dekt NL, DE en EN
LETTERS = {'noto-sans': [400, 500, 600, 700], 'lora': [500, 600], 'arimo': [400, 700], 'tinos': [400, 700], 'cousine': [400, 700]}
F = os.path.join(WEB, 'fonts-web')
os.makedirs(F, exist_ok=True)
css = ['/* Ingebouwde lettertypes (SIL Open Font License / Apache 2.0) */']
for naam, gewichten in LETTERS.items():
    for g in gewichten:
        tekst = open(os.path.join(NM, '@fontsource', naam, f'{g}.css'), encoding='utf8').read()
        for blok in re.findall(r'@font-face\s*{[^}]*}', tekst):
            m = re.search(r'files/([\w\-]+-(latin|latin-ext)-\d+-normal)\.woff2', blok)
            if not m:
                continue
            bestand = m.group(1) + '.woff2'
            shutil.copy(os.path.join(NM, '@fontsource', naam, 'files', bestand), os.path.join(F, bestand))
            blok = re.sub(r'src:[^;]+;', f"src: url(/fonts-web/{bestand}) format('woff2');", blok)
            css.append(blok)
open(os.path.join(WEB, 'css', 'lettertypes.css'), 'w', encoding='utf8').write('\n'.join(css) + '\n')

# index.html: lokale lettertypes, geen webmanifest
p = os.path.join(WEB, 'index.html')
html = open(p, encoding='utf8').read()
html = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', '<link rel="stylesheet" href="/css/lettertypes.css">', html)
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', html)
assert 'googleapis' not in html, 'Google Fonts nog in index.html'
open(p, 'w', encoding='utf8').write(html)

# Pictogram (1024 px) uit het logo
os.makedirs(os.path.join(HIER, 'build'), exist_ok=True)
logo = open(os.path.join(BRON, 'img', 'logo.svg'), encoding='utf8').read()
from playwright.sync_api import sync_playwright  # noqa: E402
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1024, 'height': 1024})
    pg.set_content(f"""<html><body style="margin:0;background:transparent">
      <div style="width:1024px;height:1024px;display:grid;place-items:center">
        <div style="width:824px;height:824px;border-radius:185px;background:#f8f5f0;box-shadow:0 10px 30px rgba(0,0,0,.18);display:grid;place-items:center">
          <div style="width:560px;height:560px">{logo.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
        </div></div></body></html>""")
    pg.screenshot(path=os.path.join(HIER, 'build', 'icon.png'), omit_background=True)
    b.close()

grootte = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(WEB) for f in fs)
print(f'web/ klaar: {grootte / 1e6:.1f} MB')
