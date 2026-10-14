import re, sys, base64
from playwright.sync_api import sync_playwright
V='/home/claude/bladwerk/test/voorbeelden/'; U='/home/claude/bladwerk/test/uitvoer/'
B='http://localhost:3100'
NL=re.compile(r"\b(het|een|je|niet|naar|wordt|bestand|bestanden|pagina|pagina's|opslaan|annuleren|sluiten|klik|tekst|verwijderen|handtekening|samenvoegen|splitsen|verkleinen|openen|gekozen|kleur|zoals|waar|deze|dit|ook|alleen|eigen|maken|herkennen|ondertekenen|invullen|wijzigingen|vandaag|stempel|vinkje|kruisje|markeren|opmerking|groter|kleiner|linksom|rechtsom)\b", re.I)
sig = 'data:image/png;base64,' + base64.b64encode(open(V+'handtekening.png','rb').read()).decode()
def run(taal):
    gevonden=set(); ontbreekt=[]
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True, locale={'en':'en-GB','de':'de-DE'}[taal])
        ctx.add_init_script("window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined;"
                            "localStorage.setItem('bladwerk.handtekening', JSON.stringify({bron:%r,breedte:400,hoogte:120}));" % sig)
        pg=ctx.new_page()
        pg.on('console', lambda m: ontbreekt.append(m.text) if 'vertaling ontbreekt' in m.text else None)
        def kijk(label):
            txt=pg.evaluate("""() => { const t=[]; const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while(w.nextNode()){ const n=w.currentNode; const el=n.parentElement; if(!el||el.closest('script,style')) continue;
                const r=el.getBoundingClientRect(); if(r.width===0&&r.height===0) continue; if(n.textContent.trim()) t.push(n.textContent.trim()); }
              document.querySelectorAll('[title],[placeholder],[aria-label]').forEach(e=>{ ['title','placeholder','aria-label'].forEach(a=>{ if(e.getAttribute(a)) t.push(e.getAttribute(a)); }); });
              return t; }""")
            for x in txt:
                if x in ('brief','formulier','brief.pdf','formulier.pdf','Bladwerk','Nederlands','English','Deutsch'): continue
                for m in NL.finditer(x): gevonden.add((label, x[:90]))
        pg.goto(B+'/'); pg.wait_for_selector('#bw-wachtwoord'); kijk('inloggen')
        pg.fill('#bw-wachtwoord','fout'); pg.click('.login-formulier button'); pg.wait_for_selector('.login-formulier .fouttekst:not([hidden])')
        servermelding=pg.inner_text('.login-formulier .fouttekst')
        pg.fill('#bw-wachtwoord','test456'); pg.click('.login-formulier button'); pg.wait_for_selector('.sleepvak'); pg.wait_for_timeout(300)
        kijk('start'); pg.screenshot(path=U+f't-{taal}-start.png')
        # handtekening-venster
        pg.click('.klus:last-child'); pg.wait_for_selector('.venster'); kijk('handtekening'); pg.keyboard.press('Escape')
        # klussen met een bestand: splitsen, verkleinen, plaatjes
        for i in [1,7,5]:
            with pg.expect_file_chooser() as fc: pg.locator('.klus').nth(i).click()
            fc.value.set_files(V+'brief.pdf'); pg.wait_for_selector('.venster'); kijk(f'klus{i}'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        with pg.expect_file_chooser() as fc: pg.locator('.klus').nth(0).click()
        fc.value.set_files([V+'brief.pdf',V+'liggend.pdf']); pg.wait_for_selector('.orden-lijst li'); kijk('samenvoegen'); pg.keyboard.press('Escape')
        with pg.expect_file_chooser() as fc: pg.locator('.klus').nth(4).click()
        fc.value.set_files([V+'foto.jpg']); pg.wait_for_selector('.orden-lijst li'); kijk('fotos'); pg.keyboard.press('Escape')
        # werkruimte
        with pg.expect_file_chooser() as fc: pg.click('.sleepvak')
        fc.value.set_files(V+'formulier.pdf'); pg.wait_for_selector('.pagina canvas'); pg.wait_for_timeout(700)
        kijk('werkruimte'); pg.screenshot(path=U+f't-{taal}-werkruimte.png')
        bb=pg.locator('.pagina').first.bounding_box()
        z=bb['width']/595.28
        def klik(x,y): pg.mouse.click(bb['x']+x*z, bb['y']+y*z)
        for g,(x,y) in [('tekst',(300,300)),('datum',(300,350)),('vinkje',(300,400)),('handtekening',(300,450)),('stempel',(300,550)),('opmerking',(520,260))]:
            pg.click(f'[data-gereedschap={g}]'); kijk('hint-'+g)
            klik(x,y)
            if g=='tekst': pg.keyboard.type('Hello'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100); pg.locator('.ann-tekst').first.click()
            pg.wait_for_timeout(150); kijk('eigenschappen-'+g)
            if g=='opmerking': pg.fill('.eigenschappen textarea','Note'); pg.keyboard.press('Tab')
            pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
        pg.click('[data-gereedschap=markeren]'); kijk('hint-markeren')
        pg.mouse.move(bb['x']+70*z, bb['y']+112*z); pg.mouse.down(); pg.mouse.move(bb['x']+250*z, bb['y']+128*z, steps=4); pg.mouse.up(); kijk('eig-markeren'); pg.keyboard.press('Escape')
        pg.click('[data-gereedschap=corrigeren]'); kijk('hint-corrigeren'); klik(80,60); pg.wait_for_timeout(300); kijk('corrigeren'); pg.keyboard.press('Escape')
        pg.keyboard.press('Escape')
        # vensters
        pg.locator('.balk-rechts .knop-primair').click(); pg.wait_for_selector('.venster'); kijk('opslaan'); pg.screenshot(path=U+f't-{taal}-opslaan.png')
        with pg.expect_download() as dl: pg.locator('.venster .knop-primair').click()
        dl.value.save_as(U+f't-{taal}.pdf'); naam=dl.value.suggested_filename
        pg.locator('.paginagroep .knop').nth(6).click(); pg.wait_for_selector('.venster'); kijk('afbeeldingen'); pg.keyboard.press('Escape')
        pg.locator('.paginagroep .knop').nth(4).click(); pg.wait_for_selector('.venster'); kijk('ocr-vraag'); pg.keyboard.press('Escape')
        pg.locator('.paginagroep .knop').nth(0).click(); pg.wait_for_timeout(300)
        pg.locator('.balk-rechts .knop').nth(1).click(); pg.wait_for_selector('.venster'); kijk('sluiten'); pg.keyboard.press('Escape')
        b.close()
    import pikepdf
    auteur=[str(a.get('/T')) for pg_ in pikepdf.open(U+f't-{taal}.pdf').pages for a in (pg_.obj.get('/Annots') or []) if a.get('/Subtype')=='/Text']
    print(f'== {taal}: servermelding="{servermelding}", bestand="{naam}", auteur opmerking={auteur}')
    print('ontbrekende vertalingen:', sorted(set(ontbreekt)) or 'geen')
    print('mogelijk Nederlands:', sorted(gevonden) or 'geen')
for taal in sys.argv[1:]: run(taal)
