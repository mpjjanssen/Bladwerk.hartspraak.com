/* Test van de losse app (draait de Linux-versie van Electron onder Xvfb). */
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

const V = '/home/claude/bladwerk/test/voorbeelden/';
const U = '/home/claude/bladwerk/test/uitvoer/';
const sig = 'data:image/png;base64,' + fs.readFileSync(V + 'handtekening.png').toString('base64');
const log = (...a) => console.log(...a);

(async () => {
  for (const taal of ['nl', 'de']) {
    const app = await electron.launch({
      args: ['--no-sandbox', `--lang=${taal}`, __dirname],
      env: { ...process.env, LANG: taal === 'de' ? 'de_DE.UTF-8' : 'nl_NL.UTF-8', LANGUAGE: taal },
    });
    const pg = await app.firstWindow();
    const fouten = [];
    pg.on('pageerror', (e) => fouten.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error' || /vertaling ontbreekt/.test(m.text())) fouten.push(m.text()); });
    await pg.waitForSelector('.sleepvak', { timeout: 20000 });
    log(`== ${taal}: titel`, await pg.title(), '| taal', await pg.evaluate(() => document.documentElement.lang));
    log('inlogscherm?', await pg.locator('#bw-wachtwoord').count(), '| klussen:', (await pg.locator('.klus strong').allInnerTexts()).join(', '));
    log('kop:', (await pg.locator('.kop-links').innerText()).replace(/\n/g, ' | '));
    log('voet:', await pg.locator('.start-voet').innerText());
    log('lettertype geladen:', await pg.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Noto Sans"') && [...document.fonts].some((f) => f.family.includes('Noto Sans') && f.status === 'loaded'); }));
    log('gebruiker:', await pg.evaluate(() => window.bladwerkGebruiker));
    await pg.screenshot({ path: U + `app-${taal}-start.png` });

    // Mac-tips
    await pg.locator('.klus', { hasText: taal === 'de' ? 'Umwandeln' : 'Omzetten' }).click();
    await pg.waitForSelector('.venster');
    log('tips:', (await pg.locator('.venster h2').innerText()));
    await pg.keyboard.press('Escape');

    // "Open met → Bladwerk": stuur een PDF zoals de Mac dat doet
    await app.evaluate(({ BrowserWindow }, b64) => {
      const b = Buffer.from(b64, 'base64');
      BrowserWindow.getAllWindows()[0].webContents.send('bladwerk:open', [{ naam: 'brief.pdf', bytes: new Uint8Array(b) }]);
    }, fs.readFileSync(V + 'brief.pdf').toString('base64'));
    await pg.waitForSelector('.pagina canvas, .venster', { timeout: 15000 });
    if (await pg.locator('.venster').count()) { log('vraag bij oud concept:', await pg.locator('.venster h2').innerText()); await pg.locator('.venster .knop-gevaar').click(); }
    await pg.waitForSelector('.pagina canvas', { timeout: 15000 });
    await pg.waitForFunction(() => document.querySelector('.pagina').dataset.getekend === '1');
    log('geopend via Open met:', await pg.locator('.docnaam').innerText(), '| paginas', await pg.locator('.mini').count());
    log('Meer-knoppen:', (await pg.locator('.paginagroep .knop').allInnerTexts()).join(', '));

    // Handtekening + tekst plaatsen en opslaan via Bewaar-venster (download)
    await pg.evaluate((s) => localStorage.setItem('bladwerk.handtekening', JSON.stringify({ bron: s, breedte: 400, hoogte: 120 })), sig);
    await pg.locator('.gereedschap .linkknop').click(); // handtekening instellen-venster openen en sluiten ververst knoppen
    await pg.keyboard.press('Escape');
    const bb = await pg.locator('.pagina').first().boundingBox();
    const z = bb.width / 595.28;
    await pg.click('[data-gereedschap=tekst]');
    await pg.mouse.click(bb.x + 80 * z, bb.y + 300 * z);
    await pg.keyboard.type('Getest in de app');
    await pg.keyboard.press('Escape');
    await pg.click('[data-gereedschap=handtekening]');
    await pg.mouse.click(bb.x + 400 * z, bb.y + 400 * z);
    await pg.click('[data-gereedschap=opmerking]');
    await pg.mouse.click(bb.x + 500 * z, bb.y + 200 * z);
    await pg.fill('.eigenschappen textarea', 'Notitie');
    await pg.keyboard.press('Tab');

    // Opslaan: de Mac-vensters vervangen we in de test door vaste antwoorden
    const doel = U + `app-${taal}.pdf`;
    await app.evaluate(({ dialog }, d) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: d });
      dialog.showMessageBoxSync = () => 0;
    }, doel);
    if (fs.existsSync(doel)) fs.unlinkSync(doel);
    await pg.locator('.balk-rechts .knop-primair').click();
    await pg.waitForSelector('.venster');
    log('grootte-keuze zichtbaar in opslaan?', await pg.locator('.venster select').count(), '| knoppen:', (await pg.locator('.venster-knoppen .knop').allInnerTexts()).join(', '));
    await pg.locator('.venster .knop-primair').click();
    for (let i = 0; i < 40 && !fs.existsSync(doel); i++) await pg.waitForTimeout(250);
    await pg.waitForTimeout(300);
    log('opgeslagen:', fs.existsSync(doel) ? `${fs.statSync(doel).size} bytes` : 'NEE', '| melding:', await pg.locator('.melding').last().innerText().catch(() => '-'));

    // Openen via het Mac-venster (Bestand kiezen) en het origineel overschrijven
    const kopie = U + `app-${taal}-origineel.pdf`;
    fs.copyFileSync(V + 'formulier.pdf', kopie);
    const voor = fs.statSync(kopie).size;
    await app.evaluate(({ dialog }, k) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [k] }); }, kopie);
    await pg.locator('.balk-rechts .knop').nth(1).click();
    await pg.waitForSelector('.venster, .sleepvak');
    if (await pg.locator('.venster').count()) await pg.locator('.venster .knop-gevaar').click();
    await pg.waitForSelector('.sleepvak');
    await pg.click('.sleepvak');
    await pg.waitForSelector('.veldinvoer');
    await pg.fill('.veldinvoer[data-veld=naam]', 'Overschreven in de app'); await pg.keyboard.press('Tab');
    await pg.locator('.balk-rechts .knop-primair').click();
    await pg.waitForSelector('.venster');
    await pg.locator('.venster-knoppen .knop').nth(1).click();   // Origineel overschrijven
    await pg.waitForSelector('.venster h2');
    await pg.locator('.venster .knop-gevaar').click();            // bevestigen
    await pg.waitForTimeout(800);
    log('origineel overschreven:', fs.statSync(kopie).size !== voor ? 'ja' : 'NEE');

    // Concept: sluit de app met wijzigingen en start opnieuw
    await pg.click('[data-gereedschap=vinkje]');
    await pg.mouse.click(bb.x + 80 * z, bb.y + 350 * z);
    await pg.keyboard.press('Escape');
    await pg.waitForTimeout(1600);
    await app.evaluate(({ dialog }) => { global.gevraagd = 0; dialog.showMessageBoxSync = () => { global.gevraagd++; return 0; }; });
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.reload(); });
    await pg.waitForTimeout(800);
    log('vraag bij sluiten met wijzigingen:', await app.evaluate(() => global.gevraagd));
    await pg.waitForSelector('.sleepvak, .pagina', { timeout: 15000 });
    log('verder waar je was:', await pg.locator('.verder').count() ? await pg.locator('.verder span').innerText() : 'nee');

    log('fouten:', fouten.length ? fouten : 'geen');
    await app.close();
  }
})().catch((e) => { console.error('TEST MISLUKT:', e); process.exit(1); });
