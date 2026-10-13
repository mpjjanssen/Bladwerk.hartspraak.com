import os, zipfile, io
from playwright.sync_api import sync_playwright
V='/home/claude/bladwerk/test/voorbeelden/'; U='/home/claude/bladwerk/test/uitvoer/'
fouten=[]
def log(*a): print(*a, flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
    ctx.add_init_script("window.showOpenFilePicker=undefined;window.showSaveFilePicker=undefined;window.showDirectoryPicker=undefined;")
    pg=ctx.new_page()
    pg.on('console', lambda m: fouten.append(f'{m.type}: {m.text}') if m.type=='error' else None)
    pg.on('pageerror', lambda e: fouten.append(f'PAGEERROR: {e}'))
    pg.goto('http://localhost:3100/'); pg.fill('#bw-wachtwoord','test123'); pg.click('.login-formulier button'); pg.wait_for_selector('.sleepvak')
    def klus(naam, bestanden):
        with pg.expect_file_chooser() as fc: pg.click(f'.klus:has-text("{naam}")')
        fc.value.set_files(bestanden)
    def download(knoptekst=None, timeout=120000):
        with pg.expect_download(timeout=timeout) as dl:
            if knoptekst: pg.click(f'.venster button:has-text("{knoptekst}")')
        d=dl.value; pad=U+'k-'+d.suggested_filename; d.save_as(pad); return d.suggested_filename, os.path.getsize(pad)
    # samenvoegen
    klus('Samenvoegen', [V+'brief.pdf', V+'liggend.pdf', V+'formulier.pdf']); pg.wait_for_selector('.orden-lijst li')
    pg.screenshot(path=U+'s7-samenvoegen.png')
    log('samenvoegen:', download('Samenvoegen en opslaan'))
    # splitsen per 1 -> zip
    klus('Splitsen', [V+'brief.pdf']); pg.wait_for_selector('.venster')
    n, s = download('Splitsen en opslaan'); z=zipfile.ZipFile(U+'k-'+n); log('splitsen:', n, z.namelist())
    # zelf kiezen met fout
    klus('Splitsen', [V+'brief.pdf']); pg.wait_for_selector('.venster'); pg.fill('.venster input[type=text]', '2-9'); pg.click('.venster button:has-text("Splitsen en opslaan")')
    log('foutmelding:', pg.inner_text('.venster .fouttekst')); pg.fill('.venster input[type=text]', '1-2, 3'); log('splitsen zelf:', download('Splitsen en opslaan'))
    # word naar pdf
    klus('Word naar PDF', [V+'brief.docx']); log('word->pdf:', download())
    klus('PDF naar Word', [V+'brief.pdf']); log('pdf->word:', download())
    # verkleinen
    klus('Verkleinen', [V+'groot.pdf']); pg.wait_for_selector('.venster'); log('verkleinen:', download('Verkleinen')); pg.wait_for_timeout(300); log('melding:', pg.locator('.melding').last.inner_text())
    # foto's naar pdf
    klus("Foto's naar PDF", [V+'foto.jpg', V+'handtekening-foto.jpg']); pg.wait_for_selector('.orden-lijst li'); log('fotos:', download('PDF maken en opslaan'))
    # pdf naar afbeeldingen
    klus('PDF naar afbeeldingen', [V+'brief.pdf']); pg.wait_for_selector('.venster'); log('afbeeldingen:', download('Opslaan'))
    # doorzoekbaar
    klus('Doorzoekbaar maken', [V+'scan.pdf']); log('ocr:', download())
    # handtekening instellen met foto
    pg.click('.klus:has-text("Handtekening instellen")'); pg.wait_for_selector('.venster')
    with pg.expect_file_chooser() as fc: pg.click('.venster button:has-text("Foto of scan kiezen")')
    fc.value.set_files(V+'handtekening-foto.jpg'); pg.wait_for_selector('.handtekening-voorbeeld img'); pg.wait_for_timeout(300)
    pg.screenshot(path=U+'s8-handtekening.png'); pg.click('.venster button:has-text("Bewaren")')
    log('handtekening bewaard:', pg.evaluate("!!localStorage.getItem('bladwerk.handtekening')"))
    # beveiligde pdf openen
    with pg.expect_file_chooser() as fc: pg.click('.sleepvak')
    fc.value.set_files(V+'beveiligd.pdf'); pg.wait_for_selector('.venster input[type=password]')
    pg.fill('.venster input[type=password]', 'fout'); pg.click('.venster button:has-text("Openen")')
    pg.wait_for_selector('.venster .fouttekst'); log('fout wachtwoord melding:', pg.inner_text('.venster .fouttekst'))
    pg.fill('.venster input[type=password]', 'geheim'); pg.click('.venster button:has-text("Openen")')
    pg.wait_for_selector('.pagina canvas'); log('beveiligd geopend, paginas:', pg.locator('.mini').count())
    # tekst plaatsen, dan herladen -> concept
    pg.click('[data-gereedschap=tekst]'); bb=pg.locator('.pagina').first.bounding_box(); pg.mouse.click(bb['x']+100, bb['y']+300); pg.keyboard.type('Concepttekst'); pg.keyboard.press('Escape')
    pg.wait_for_timeout(1800)
    pg.reload(); pg.wait_for_selector('.verder'); log('concept:', pg.inner_text('.verder span'))
    pg.screenshot(path=U+'s9-verder.png')
    pg.click('.verder button:has-text("Verder werken")'); pg.wait_for_selector('.ann-tekst'); log('tekst terug:', pg.inner_text('.ann-tekst'))
    b.close()
print('\n'.join(fouten) or 'geen consolefouten')
