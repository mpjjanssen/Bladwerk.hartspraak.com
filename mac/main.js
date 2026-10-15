'use strict';
/*
 * Bladwerk als losse Mac-app. Toont dezelfde werkruimte als de website,
 * maar helemaal op de eigen computer: geen server, geen inlog, geen internet.
 * PDF's openen via "Open met → Bladwerk" in de Finder.
 */
const { app, BrowserWindow, protocol, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

const SCHEMA = 'bladwerk';
const WEB = path.join(__dirname, 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
};

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEMA,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

/* Bestanden die binnenkomen voordat het venster klaar is, wachten hier. */
let wachtrij = [];
let klaar = false;
let venster = null;

function naamGebruiker() {
  try {
    if (process.platform === 'darwin') {
      const volledig = execFileSync('/usr/bin/id', ['-F'], { encoding: 'utf8' }).trim();
      if (volledig) return volledig;
    }
  } catch (_) { /* geen volledige naam */ }
  const kort = os.userInfo().username || '';
  return kort ? kort[0].toUpperCase() + kort.slice(1) : 'Bladwerk';
}
const GEBRUIKER = naamGebruiker();

function leesPdf(pad) {
  try {
    const bytes = fs.readFileSync(pad);
    return { naam: path.basename(pad), pad, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  } catch (err) {
    console.error('Kon niet lezen:', pad, err.message);
    return null;
  }
}

function openBestanden(paden) {
  const lijst = paden.filter((p) => /\.pdf$/i.test(p)).map(leesPdf).filter(Boolean);
  if (!lijst.length) return;
  if (venster && klaar) {
    venster.webContents.send('bladwerk:open', lijst);
    if (venster.isMinimized()) venster.restore();
    venster.focus();
  } else {
    wachtrij.push(...lijst);
    if (app.isReady() && !venster) maakVenster();
  }
}

/* macOS: "Open met → Bladwerk" en slepen op het Dock-pictogram. */
app.on('open-file', (e, pad) => { e.preventDefault(); openBestanden([pad]); });

/* Eén Bladwerk tegelijk; een tweede start geeft zijn bestanden door. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    openBestanden(argv.slice(1).filter((a) => !a.startsWith('-')));
    if (venster) { if (venster.isMinimized()) venster.restore(); venster.focus(); }
  });
}

ipcMain.on('bladwerk:gebruiker', (e) => { e.returnValue = GEBRUIKER; });
ipcMain.on('bladwerk:klaar', (e) => {
  klaar = true;
  if (wachtrij.length) { e.sender.send('bladwerk:open', wachtrij); wachtrij = []; }
});


/* ---------- Openen en opslaan met de vensters van de Mac ---------- */
const FILTERS = {
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  foto: [{ name: 'Foto', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff'] }],
  pdfOfFoto: [{ name: 'PDF / Foto', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'] }],
  word: [{ name: 'Word', extensions: ['doc', 'docx', 'odt', 'rtf', 'txt'] }],
};
const venterVan = (e) => BrowserWindow.fromWebContents(e.sender) || venster;

ipcMain.handle('bladwerk:kies', async (e, { meerdere, soort }) => {
  const r = await dialog.showOpenDialog(venterVan(e), {
    properties: ['openFile', ...(meerdere ? ['multiSelections'] : [])],
    filters: FILTERS[soort] || FILTERS.pdf,
  });
  if (r.canceled) return [];
  return r.filePaths.map(leesPdf).filter(Boolean);
});

ipcMain.handle('bladwerk:bewaar', async (e, { naam, bytes, map }) => {
  const ext = (path.extname(naam).slice(1) || 'pdf').toLowerCase();
  const startmap = map && fs.existsSync(map) ? map : app.getPath('documents');
  const r = await dialog.showSaveDialog(venterVan(e), {
    defaultPath: path.join(startmap, naam),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return path.basename(r.filePath);
});

/* Alleen een bestaande PDF overschrijven, nooit iets anders. */
ipcMain.handle('bladwerk:overschrijf', async (_e, { pad, bytes }) => {
  if (!pad || !/\.pdf$/i.test(pad) || !fs.existsSync(pad)) throw new Error('Kan dit bestand niet overschrijven.');
  fs.writeFileSync(pad, Buffer.from(bytes));
  return true;
});

ipcMain.handle('bladwerk:bewaarMeerdere', async (e, { bestanden, map }) => {
  const r = await dialog.showOpenDialog(venterVan(e), {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: map && fs.existsSync(map) ? map : app.getPath('documents'),
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const doel = r.filePaths[0];
  for (const b of bestanden) {
    let pad = path.join(doel, b.naam);
    const basis = pad.replace(/(\.[^.]+)$/, '');
    const ext = path.extname(pad);
    for (let i = 2; fs.existsSync(pad); i++) pad = `${basis} (${i})${ext}`;
    fs.writeFileSync(pad, Buffer.from(b.bytes));
  }
  return { n: bestanden.length, map: path.basename(doel) };
});

/* iPhone-foto's (HEIC) omzetten met het ingebouwde Mac-programma sips. */
ipcMain.handle('bladwerk:heic', async (_e, bytes) => {
  if (process.platform !== 'darwin') return null;
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'bladwerk-'));
  const invoer = path.join(map, 'foto.heic');
  const uitvoer = path.join(map, 'foto.jpg');
  try {
    fs.writeFileSync(invoer, Buffer.from(bytes));
    await new Promise((resolve, reject) => execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', invoer, '--out', uitvoer], { timeout: 60000 }, (err) => (err ? reject(err) : resolve())));
    return new Uint8Array(fs.readFileSync(uitvoer));
  } catch (err) {
    console.error('HEIC omzetten mislukt:', err.message);
    return null;
  } finally {
    fs.rmSync(map, { recursive: true, force: true });
  }
});

function teksten() {
  const taal = (app.getPreferredSystemLanguages()[0] || app.getLocale() || 'en').slice(0, 2);
  return {
    nl: { vraag: 'Er zijn wijzigingen die nog niet zijn opgeslagen.', uitleg: 'Wil je Bladwerk toch sluiten? De wijzigingen gaan dan verloren.', sluiten: 'Sluiten zonder opslaan', terug: 'Annuleren' },
    de: { vraag: 'Es gibt ungespeicherte Änderungen.', uitleg: 'Möchtest du Bladwerk trotzdem schließen? Die Änderungen gehen dann verloren.', sluiten: 'Schließen ohne Speichern', terug: 'Abbrechen' },
    en: { vraag: 'There are unsaved changes.', uitleg: 'Close Bladwerk anyway? The changes will be lost.', sluiten: 'Close without saving', terug: 'Cancel' },
  }[taal] || null;
}

function maakVenster() {
  klaar = false;
  venster = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: 'Bladwerk',
    backgroundColor: '#f8f5f0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  venster.once('ready-to-show', () => venster.show());
  venster.on('closed', () => { venster = null; klaar = false; });

  /* Vraag het eerst als er niet-opgeslagen werk is. */
  venster.webContents.on('will-prevent-unload', (e) => {
    const tk = teksten() || { vraag: 'There are unsaved changes.', uitleg: 'Close Bladwerk anyway?', sluiten: 'Close without saving', terug: 'Cancel' };
    const keuze = dialog.showMessageBoxSync(venster, {
      type: 'question', buttons: [tk.sluiten, tk.terug], defaultId: 1, cancelId: 1,
      message: tk.vraag, detail: tk.uitleg,
    });
    if (keuze === 0) e.preventDefault();
  });

  /* Links naar buiten openen in de gewone browser, nooit in de app. */
  venster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  venster.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEMA}://`)) e.preventDefault();
  });

  venster.loadURL(`${SCHEMA}://app/index.html`);
}

function maakMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      role: 'viewMenu',
      submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ]));
}

app.whenReady().then(() => {
  protocol.handle(SCHEMA, (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const pad = path.normalize(path.join(WEB, rel));
    if (!pad.startsWith(WEB + path.sep)) return new Response('Niet toegestaan', { status: 403 });
    try {
      const data = fs.readFileSync(pad);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(pad).toLowerCase()] || 'application/octet-stream' } });
    } catch (_) {
      return new Response('Niet gevonden', { status: 404 });
    }
  });

  /* Vangnet: als er toch iets wordt gedownload, met een Bewaar-venster in Documenten. */
  const { session } = require('electron');
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });

  maakMenu();
  maakVenster();

  // Bestanden die bij het starten zijn meegegeven (bijvoorbeeld bij testen op Linux).
  const meegegeven = process.argv.slice(1).filter((a) => /\.pdf$/i.test(a));
  if (meegegeven.length) openBestanden(meegegeven);

  app.on('activate', () => { if (!venster) maakVenster(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
