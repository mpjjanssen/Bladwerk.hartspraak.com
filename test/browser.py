import base64, sys, os, json
from playwright.sync_api import sync_playwright
V='/home/claude/bladwerk/test/voorbeelden/'; U='/home/claude/bladwerk/test/uitvoer/'
os.makedirs(U, exist_ok=True)
sig = 'data:image/png;base64,' + base64.b64encode(open(V+'handtekening.png','rb').read()).decode()
init = """
delete window.showOpenFilePicker; delete window.showSaveFilePicker; delete window.showDirectoryPicker;
window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
localStorage.setItem('bladwerk.handtekening', JSON.stringify({bron: %s, breedte: 400, hoogte: 120}));
""" % json.dumps(sig)
fouten = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True, locale='nl-NL')
    ctx.add_init_script(init)
    pg = ctx.new_page()
    pg.on('console', lambda m: fouten.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: fouten.append(f'PAGEERROR: {e}'))
    pg.goto('http://localhost:3100/')
    pg.fill('#bw-wachtwoord', 'test123'); pg.click('.login-formulier button')
    pg.wait_for_selector('.sleepvak')
    pg.screenshot(path=U+'s1-start.png')
    with pg.expect_file_chooser() as fc: pg.click('.sleepvak')
    fc.value.set_files(V+'brief.pdf')
    pg.wait_for_selector('.pagina canvas'); pg.wait_for_timeout(1200)
    pg.screenshot(path=U+'s2-werkruimte.png')
    pagina = pg.locator('.pagina').first
    box = pagina.bounding_box(); print('pagina box', box)
    z = box['width']/595.28
    def klik(xpt, ypt, i=0):
        bb = pg.locator('.pagina').nth(i).bounding_box()
        pg.mouse.click(bb['x']+xpt*z, bb['y']+ypt*z)
    # tekst
    pg.click('[data-gereedschap=tekst]'); klik(72, 300); pg.keyboard.type('Hallo Martien, ëüß'); pg.keyboard.press('Escape')
    pg.wait_for_timeout(200)
    # handtekening
    pg.click('[data-gereedschap=handtekening]'); klik(400, 400)
    # vinkje
    pg.keyboard.press('Escape'); pg.click('[data-gereedschap=vinkje]'); klik(80, 360); pg.keyboard.press('Escape')
    # stempel
    pg.click('[data-gereedschap=stempel]'); klik(420, 520)
    # markeren slepen
    pg.click('[data-gereedschap=markeren]')
    bb = pagina.bounding_box()
    pg.mouse.move(bb['x']+70*z, bb['y']+112*z); pg.mouse.down(); pg.mouse.move(bb['x']+250*z, bb['y']+128*z, steps=5); pg.mouse.up()
    pg.keyboard.press('Escape')
    # corrigeren: regel 'Datum: 1 oktober...' baseline y=841.89-720=121.89
    pg.click('[data-gereedschap=corrigeren]'); pg.wait_for_timeout(200)
    bb = pagina.bounding_box(); pg.mouse.move(bb['x']+120*z, bb['y']+118*z); pg.wait_for_timeout(300)
    klik(120, 118); pg.wait_for_timeout(400)
    pg.keyboard.press('Meta+a') if False else None
    # selecteer alles in contenteditable en vervang
    pg.keyboard.press('Control+a'); pg.keyboard.type('Datum: 1 oktober 2026, gecorrigeerd: Dortmund'); pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    pg.screenshot(path=U+'s3-aantekeningen.png')
    n = pg.evaluate("document.querySelectorAll('.pagina:first-of-type .ann, .pagina .ann').length"); print('aantekeningen in beeld:', n)
    # pagina 3 verwijderen, pagina 2 draaien via miniatuur
    minis = pg.locator('.mini')
    minis.nth(1).hover(); minis.nth(1).locator('button[title="Rechtsom draaien"]').click()
    minis = pg.locator('.mini'); minis.nth(2).hover(); minis.nth(2).locator('button[title="Verwijderen"]').click()
    pg.wait_for_timeout(500)
    print('minis na verwijderen:', pg.locator('.mini').count())
    # ongedaan maken + opnieuw
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); print('na ongedaan:', pg.locator('.mini').count())
    pg.keyboard.press('Control+Shift+z'); pg.wait_for_timeout(300); print('na opnieuw:', pg.locator('.mini').count())
    pg.screenshot(path=U+'s4-na-paginabeheer.png')
    # opslaan
    pg.click('button:has-text("Opslaan")'); pg.wait_for_selector('.venster')
    pg.screenshot(path=U+'s5-opslaan.png')
    with pg.expect_download() as dl: pg.click('.venster button:has-text("Opslaan als nieuw bestand")')
    d = dl.value; print('download:', d.suggested_filename); d.save_as(U+'browser-resultaat.pdf')
    pg.wait_for_timeout(500)
    # formulier
    pg.click('button:has-text("Sluiten")'); pg.wait_for_timeout(300)
    if pg.locator('.venster').count(): pg.click('.venster button:has-text("Sluiten zonder opslaan")')
    pg.wait_for_selector('.sleepvak')
    with pg.expect_file_chooser() as fc: pg.click('.sleepvak')
    fc.value.set_files(V+'formulier.pdf')
    pg.wait_for_selector('.veldinvoer'); pg.wait_for_timeout(500)
    pg.fill('.veldinvoer[data-veld=naam]', 'Martinus Janssen'); pg.keyboard.press('Tab')
    pg.check('.veldinvoer[data-veld=akkoord]')
    pg.select_option('.veldinvoer[data-veld=groep]', 'Tweede jaar')
    pg.screenshot(path=U+'s6-formulier.png')
    pg.click('button:has-text("Opslaan")'); pg.wait_for_selector('.venster')
    with pg.expect_download() as dl: pg.click('.venster button:has-text("Opslaan als nieuw bestand")')
    dl.value.save_as(U+'browser-formulier.pdf'); print('formulier:', dl.value.suggested_filename)
    b.close()
print('\n'.join(fouten) or 'geen consolefouten')
