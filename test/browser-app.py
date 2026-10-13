import json
from playwright.sync_api import sync_playwright
V='/home/claude/bladwerk/test/voorbeelden/'; U='/home/claude/bladwerk/test/uitvoer/'
B='http://localhost:3100'
def log(*a): print(*a, flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
    ctx.add_init_script('window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined;')
    pg=ctx.new_page(); fouten=[]
    pg.on('pageerror', lambda e: fouten.append(str(e)))
    pg.goto(B+'/'); pg.wait_for_selector('#bw-wachtwoord')
    pg.screenshot(path=U+'a1-inloggen.png')
    pg.fill('#bw-wachtwoord','fout'); pg.click('.login-formulier button'); pg.wait_for_selector('.login-formulier .fouttekst:not([hidden])')
    log('fout:', pg.inner_text('.login-formulier .fouttekst'))
    pg.fill('#bw-wachtwoord','test123'); pg.click('.login-formulier button'); pg.wait_for_selector('.sleepvak')
    # installeerbaarheid
    cdp=ctx.new_cdp_session(pg)
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== undefined")
    pg.evaluate("navigator.serviceWorker.ready.then(()=>true)")
    m=cdp.send('Page.getAppManifest'); log('manifest fouten:', m.get('errors'))
    log('file_handlers:', json.loads(m['data'])['file_handlers'][0]['accept'])
    pg.wait_for_timeout(1500)
    try: log('installeerbaar? fouten:', cdp.send('Page.getInstallabilityErrors')['installabilityErrors'])
    except Exception as e: log('installability check niet beschikbaar:', e)
    log('sw actief:', pg.evaluate("navigator.serviceWorker.ready.then(r=>!!r.active)"))
    # openen via "Open met": simuleer met het testhaakje
    def open_met(naam):
        pg.evaluate("""async (naam) => { const r = await fetch('/test-bestand/' + naam); }""", naam) if False else None
        data=open(V+naam,'rb').read()
        pg.evaluate("""async ([naam, b64]) => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const f = new File([bytes], naam, {type:'application/pdf'}); window.bladwerkOpen([{bestand: f, handle: null}]); }""", [naam, __import__('base64').b64encode(data).decode()])
    open_met('brief.pdf'); pg.wait_for_selector('.pagina canvas'); log('geopend:', pg.inner_text('.docnaam'), pg.title())
    # wijziging maken, dan ander bestand openen -> vraag
    pg.click('[data-gereedschap=vinkje]'); bb=pg.locator('.pagina').first.bounding_box(); pg.mouse.click(bb['x']+100, bb['y']+200); pg.keyboard.press('Escape')
    open_met('formulier.pdf'); pg.wait_for_selector('.venster'); log('vraag:', pg.inner_text('.venster h2'))
    pg.screenshot(path=U+'a2-ander-document.png')
    pg.click('.venster button:has-text("Toevoegen aan dit document")'); pg.wait_for_timeout(800); log('paginas na toevoegen:', pg.locator('.mini').count())
    open_met('liggend.pdf'); pg.wait_for_selector('.venster'); pg.click('.venster button:has-text("Sluiten zonder opslaan")'); pg.wait_for_timeout(800)
    log('na vervangen:', pg.inner_text('.docnaam'), pg.locator('.mini').count(), 'pagina')
    # sessie verlopen midden in een klus
    ctx.clear_cookies()
    pg.click('button:has-text("Opslaan als Word")'); pg.wait_for_selector('#bw-wachtwoord'); log('inlogscherm bij verlopen sessie: ja')
    with pg.expect_download(timeout=60000) as dl:
        pg.fill('#bw-wachtwoord','test123'); pg.click('.login-formulier button')
    log('klus afgemaakt na inloggen:', dl.value.suggested_filename)
    # offline openen
    pg.click('button:has-text("Sluiten")'); pg.wait_for_timeout(300)
    if pg.locator('.venster').count(): pg.click('.venster button:has-text("Sluiten zonder opslaan")')
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('.sleepvak', timeout=15000)
    log('offline melding:', pg.locator('.offline-melding').count()==1)
    open_met('brief.pdf'); pg.wait_for_selector('.pagina canvas', timeout=15000); log('offline document geopend:', pg.locator('.mini').count(), 'paginas')
    pg.screenshot(path=U+'a3-offline.png')
    ctx.set_offline(False)
    b.close()
print('paginafouten:', fouten or 'geen')
