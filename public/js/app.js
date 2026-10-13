/* Startpagina, inloggen, installeren als app en het openen van de werkruimte. */
import { el, icoon, melding, kiesBestanden, bevestig, dialoog } from './hulp.js';
import { Werkruimte, bestandenUitSlepen } from './werkruimte.js';
import * as concept from './concept.js';
import * as klussen from './klussen.js';
import { haalHandtekening } from './handtekening.js';
import { zorgVoorSessie, toonInlog } from './inloggen.js';

const start = document.getElementById('start');
const werkEl = document.getElementById('werkruimte');
let werkruimte = null;
let installPrompt = null;
let offline = false;

const isApp = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches;

function nieuweWerkruimte() {
  werkruimte = new Werkruimte(werkEl, {
    opSluiten: () => { werkruimte = null; toonStart(); },
  });
  return werkruimte;
}

async function openBestanden(lijst) {
  if (!lijst || !lijst.length) return;
  if (werkruimte) {
    await werkruimte.laadBestanden(lijst);
    return;
  }
  const w = nieuweWerkruimte();
  start.hidden = true;
  const ok = await w.laadBestanden(lijst);
  if (!ok) {
    w.opruimen();
    werkruimte = null;
    toonStart();
  } else {
    document.title = `${w.naam} – Bladwerk`;
    await concept.wisConcept();
    // Begin een nieuw concept met de zojuist geopende bronnen.
    for (const [id, b] of w.bronnen) await concept.bewaarBron(id, b);
    w.bewaarConceptStraks();
  }
}

/*
 * Bestanden die via "Open met → Bladwerk" binnenkomen. Er gaat nooit
 * ongemerkt werk verloren: bij niet-opgeslagen wijzigingen vragen we eerst.
 */
async function ontvangGeopendeBestanden(lijst) {
  if (!lijst.length) return;
  const namen = lijst.map((k) => `"${k.bestand.name}"`).join(', ');

  if (werkruimte) {
    if (werkruimte.gewijzigd) {
      const keuze = await dialoog({
        titel: 'Ander document openen',
        inhoud: `Je opent ${namen}, maar in "${werkruimte.naam}" zijn nog niet-opgeslagen wijzigingen. Wat wil je doen?`,
        knoppen: [
          { label: 'Annuleren', waarde: null },
          { label: 'Toevoegen aan dit document', waarde: 'toevoegen' },
          { label: 'Sluiten zonder opslaan', waarde: 'vervangen', gevaar: true },
        ],
      });
      if (!keuze) return;
      if (keuze === 'toevoegen') { await werkruimte.laadBestanden(lijst); return; }
    }
    werkruimte.opruimen();
    werkruimte = null;
    await concept.wisConcept();
    await openBestanden(lijst);
    return;
  }

  const c = await concept.laadConcept();
  if (c && c.gewijzigd) {
    const ok = await bevestig('Ander document openen',
      `Je hebt nog niet-opgeslagen werk in "${c.naam}". Als je ${namen} opent, gaat dat werk verloren.`,
      'Toch openen', true);
    if (!ok) return;
  }
  await openBestanden(lijst);
}

/* Moet meteen bij het laden worden gezet, anders mist de app het bestand. */
const sessieKlaar = zorgVoorSessie().then((stand) => {
  offline = stand === 'offline';
  return stand;
});
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    try {
      const lijst = [];
      for (const h of params.files) {
        if (h.kind === 'file') lijst.push({ bestand: await h.getFile(), handle: h });
      }
      if (toonInlog.melding) toonInlog.melding(`Na het inloggen opent Bladwerk ${lijst.map((k) => `"${k.bestand.name}"`).join(', ')}.`);
      await sessieKlaar;
      await startKlaar;
      await ontvangGeopendeBestanden(lijst);
    } catch (err) {
      console.error(err);
      melding('Het bestand kon niet worden geopend.', 'fout');
    }
  });
}

const KLUSSEN = [
  { id: 'samenvoegen', titel: 'Samenvoegen', uitleg: 'Meerdere PDF\'s tot één bestand', icoon: 'samenvoegen', doe: () => klussen.samenvoegen({ openInWerkruimte: openBestanden }) },
  { id: 'splitsen', titel: 'Splitsen', uitleg: 'Een PDF in delen opsplitsen', icoon: 'splitsen', doe: klussen.splitsen },
  { id: 'word-pdf', titel: 'Word naar PDF', uitleg: 'Ook .doc, .odt en .rtf', icoon: 'pdf', doe: klussen.wordNaarPdf },
  { id: 'pdf-word', titel: 'PDF naar Word', uitleg: 'Om een PDF verder te bewerken', icoon: 'word', doe: klussen.pdfNaarWord },
  { id: 'fotos', titel: 'Foto\'s naar PDF', uitleg: 'Ook iPhone-foto\'s (HEIC)', icoon: 'foto', doe: () => klussen.fotosNaarPdf({ openInWerkruimte: openBestanden }) },
  { id: 'plaatjes', titel: 'PDF naar afbeeldingen', uitleg: 'Elke pagina als PNG of JPG', icoon: 'afbeeldingen', doe: klussen.pdfNaarPlaatjes },
  { id: 'ocr', titel: 'Doorzoekbaar maken', uitleg: 'Tekst in scans herkennen', icoon: 'zoeken', doe: klussen.doorzoekbaar },
  { id: 'verkleinen', titel: 'Verkleinen', uitleg: 'Voor e-mail, scherm of drukwerk', icoon: 'verkleinen', doe: klussen.verkleinen },
  { id: 'handtekening', titel: 'Handtekening instellen', uitleg: '', icoon: 'handtekening', doe: async () => { await klussen.handtekeningInstellen(); toonStart(); } },
];

function uitlegOpenMet() {
  return dialoog({
    titel: 'PDF\'s openen met Bladwerk',
    inhoud: el('div', {},
      el('p', {}, 'Klik in de Finder met de rechtermuisknop op een PDF en kies "Open met" → "Bladwerk". Het document opent dan direct in de werkruimte.'),
      el('p', {}, 'Voorvertoning blijft gewoon de standaard als je dubbelklikt.'),
      el('p', { class: 'klein' }, 'Staat Bladwerk niet in het lijstje? Kies dan "Andere…" en zoek Bladwerk in de map Programma\'s, onder "Chrome-apps".')),
  });
}

async function installeer() {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  if (outcome === 'accepted') toonStart();
}

async function toonStart() {
  document.title = 'Bladwerk';
  werkEl.hidden = true;
  start.hidden = false;
  start.innerHTML = '';

  const sleepVak = el('button', { type: 'button', class: 'sleepvak' },
    icoon('open', 40),
    el('strong', {}, 'PDF openen'),
    el('span', {}, 'Sleep een of meer PDF\'s of foto\'s hierheen, of klik om te kiezen'));
  sleepVak.addEventListener('click', async () => openBestanden(await kiesBestanden({ meerdere: true, soort: 'pdfOfFoto' })));

  const verder = el('div', { class: 'verder', hidden: true });
  const kaart = (k) => {
    let uitleg = k.uitleg;
    if (k.id === 'handtekening') uitleg = haalHandtekening() ? 'Ingesteld · wijzigen' : 'Nog niet ingesteld';
    return el('button', { type: 'button', class: 'klus', onclick: () => k.doe().catch((e) => melding(e.message, 'fout')) },
      el('span', { class: 'klus-icoon' }, icoon(k.icoon, 24)),
      el('span', { class: 'klus-tekst' }, el('strong', {}, k.titel), uitleg ? el('span', {}, uitleg) : null));
  };

  const kopLinks = el('div', { class: 'kop-links' });
  if (installPrompt && !isApp()) {
    kopLinks.append(el('button', { type: 'button', class: 'knop knop-klein', onclick: installeer }, icoon('toevoegen', 16), el('span', {}, 'Als app installeren')));
  }
  if (isApp()) {
    kopLinks.append(el('button', { type: 'button', class: 'linkknop', onclick: uitlegOpenMet }, 'PDF\'s openen met Bladwerk'));
  }
  kopLinks.append(el('form', { method: 'post', action: '/uitloggen' }, el('button', { type: 'submit', class: 'linkknop' }, 'Uitloggen')));

  start.append(
    el('header', { class: 'start-kop' },
      el('div', { class: 'merk merk-groot' }, el('img', { src: '/img/logo.svg', alt: '' }), el('span', {}, 'Bladwerk')),
      kopLinks),
    el('main', { class: 'start-inhoud' },
      offline ? el('p', { class: 'offline-melding' }, 'Je bent offline. Bekijken, invullen en ondertekenen werken gewoon; omzetten, verkleinen en tekst herkennen niet.') : null,
      verder,
      sleepVak,
      el('h2', {}, 'Snelle klussen'),
      el('div', { class: 'klussen' }, KLUSSEN.map(kaart)),
      el('p', { class: 'klein start-voet' },
        'Pagina\'s beheren, invullen, ondertekenen en aantekeningen gebeuren helemaal op je eigen computer. Alleen bij omzetten, verkleinen en tekst herkennen gaat een bestand even naar je eigen server, en daar wordt het direct gewist.')));

  const c = await concept.laadConcept();
  if (c) {
    verder.hidden = false;
    const tijd = new Date(c.tijd).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    verder.append(
      el('div', {},
        el('strong', {}, 'Verder waar je was'),
        el('span', {}, `${c.naam} · ${c.aantal || c.staat.paginas.length} pagina's · ${tijd}${c.gewijzigd ? ' · niet opgeslagen wijzigingen' : ''}`)),
      el('div', { class: 'rij' },
        el('button', { type: 'button', class: 'knop knop-primair', onclick: async () => {
          const w = nieuweWerkruimte();
          start.hidden = true;
          try {
            await w.laadConcept(c);
            document.title = `${w.naam} – Bladwerk`;
          } catch (err) {
            melding('Het concept kon niet worden geopend.', 'fout');
            w.opruimen(); werkruimte = null; toonStart();
          }
        } }, 'Verder werken'),
        el('button', { type: 'button', class: 'knop', onclick: async () => {
          if (c.gewijzigd && !(await bevestig('Concept weggooien', 'Je wijzigingen in dit document zijn nog niet opgeslagen. Weggooien?', 'Weggooien', true))) return;
          await concept.wisConcept();
          verder.remove();
        } }, 'Weggooien')));
  }
}

/* Slepen naar de startpagina */
document.addEventListener('dragover', (e) => {
  if (!start.hidden && e.dataTransfer && e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    start.classList.add('sleepdoel');
  }
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) start.classList.remove('sleepdoel'); });
document.addEventListener('drop', async (e) => {
  start.classList.remove('sleepdoel');
  if (start.hidden || !e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  openBestanden(await bestandenUitSlepen(e.dataTransfer));
});

/* Installeren als app */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!werkruimte && !start.hidden) toonStart();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  melding('Bladwerk is geïnstalleerd. Je vindt het in het Dock en in de map Programma\'s.', 'goed', 8000);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker niet geregistreerd', err));
}

/* Lettertypen voor de voorvertoning van tekst vooraf laden, zodat maten kloppen. */
if (document.fonts) {
  for (const f of ['Arimo', 'Tinos', 'Cousine']) {
    document.fonts.load(`12px ${f}`).catch(() => {});
    document.fonts.load(`bold 12px ${f}`).catch(() => {});
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  melding((e.reason && e.reason.message) || 'Er ging iets mis.', 'fout', 7000);
});

/* Alleen bedoeld voor de automatische tests. */
window.bladwerkOpen = ontvangGeopendeBestanden;

const startKlaar = sessieKlaar.then(async () => {
  // Was er al een bestand via "Open met" binnengekomen, dan komt de werkruimte direct.
  await toonStart();
});
