/* Startpagina en het openen van de werkruimte. */
import { el, icoon, melding, kiesBestanden, bevestig } from './hulp.js';
import { Werkruimte, bestandenUitSlepen } from './werkruimte.js';
import * as concept from './concept.js';
import * as klussen from './klussen.js';
import { haalHandtekening } from './handtekening.js';

const start = document.getElementById('start');
const werkEl = document.getElementById('werkruimte');
let werkruimte = null;

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
    await concept.wisConcept();
    // Begin een nieuw concept met de zojuist geopende bronnen.
    for (const [id, b] of w.bronnen) await concept.bewaarBron(id, b);
    w.bewaarConceptStraks();
  }
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

async function toonStart() {
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

  start.append(
    el('header', { class: 'start-kop' },
      el('div', { class: 'merk merk-groot' }, el('img', { src: '/img/logo.svg', alt: '' }), el('span', {}, 'Bladwerk')),
      el('form', { method: 'post', action: '/uitloggen' }, el('button', { type: 'submit', class: 'linkknop' }, 'Uitloggen'))),
    el('main', { class: 'start-inhoud' },
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
          try { await w.laadConcept(c); } catch (err) {
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

toonStart();
