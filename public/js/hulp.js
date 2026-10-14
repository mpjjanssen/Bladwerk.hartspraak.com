/* Kleine hulpmiddelen voor de bediening: meldingen, vensters, opslaan, server. */
import { t, locale, taal } from './i18n.js';
import { toonInlog } from './inloggen.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kind of kinderen.flat()) {
    if (kind == null || kind === false) continue;
    e.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return e;
}

export const ICONEN = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  samenvoegen: '<path d="M8 3h8v5H8zM8 16h8v5H8zM12 8v8M9 12h6"/>',
  splitsen: '<path d="M6 3h12v7H6zM6 14h12v7H6zM3 12h18" stroke-dasharray="2 2"/>',
  word: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 12l1.5 6L12 14l1.5 4L15 12"/>',
  pdf: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 17v-5h2a1.5 1.5 0 0 1 0 3H9"/>',
  foto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  zoeken: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  verkleinen: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  handtekening: '<path d="M3 17c3 0 4-8 6-8s0 8 2 8 3-5 5-5 2 4 5 4"/><path d="M3 21h18"/>',
  tekst: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  vinkje: '<path d="M4 12l5 5L20 6"/>',
  kruisje: '<path d="M6 6l12 12M18 6L6 18"/>',
  datum: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  markeren: '<path d="M15 4l5 5-9 9H6v-5z"/><path d="M4 21h16"/>',
  opmerking: '<path d="M4 5h16v11H9l-5 4z"/>',
  stempel: '<path d="M9 3h6v6l3 3v3H6v-3l3-3zM5 19h14v2H5z"/>',
  corrigeren: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  kiezen: '<path d="M5 3l14 8-6 2-2 6z"/>',
  links: '<path d="M8 4L4 8l4 4"/><path d="M4 8h9a7 7 0 1 1-6 10"/>',
  rechts: '<path d="M16 4l4 4-4 4"/><path d="M20 8h-9a7 7 0 1 0 6 10"/>',
  weg: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  uitnemen: '<path d="M6 2h9l5 5v15H6z"/><path d="M13 11v7M10 15l3 3 3-3"/>',
  toevoegen: '<path d="M12 5v14M5 12h14"/>',
  terug: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  vooruit: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  opslaan: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  sluiten: '<path d="M6 6l12 12M18 6L6 18"/>',
  afbeeldingen: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  min: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  omhoog: '<path d="M6 15l6-6 6 6"/>',
  omlaag: '<path d="M6 9l6 6 6-6"/>',
};

export function icoon(naam, grootte = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', grootte);
  s.setAttribute('height', grootte);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONEN[naam] || '';
  return s;
}

export function knop(label, opties = {}) {
  const b = el('button', {
    type: 'button',
    class: ['knop', opties.soort ? `knop-${opties.soort}` : '', opties.class || ''].join(' ').trim(),
    title: opties.titel || null,
    onclick: opties.klik || null,
    disabled: opties.uit || null,
  });
  if (opties.icoon) b.append(icoon(opties.icoon, opties.icoonGrootte || 18));
  if (label) b.append(el('span', {}, label));
  return b;
}

/* ---------- Meldingen ---------- */
export function melding(tekst, soort = 'info', duur = 4500) {
  let bak = $('#meldingen');
  if (!bak) {
    bak = el('div', { id: 'meldingen', role: 'status', 'aria-live': 'polite' });
    document.body.append(bak);
  }
  const m = el('div', { class: `melding melding-${soort}` }, tekst);
  bak.append(m);
  setTimeout(() => { m.classList.add('weg'); setTimeout(() => m.remove(), 400); }, duur);
}

/* ---------- Bezig-scherm ---------- */
export function bezig(tekst) {
  const laag = el('div', { class: 'bezig' },
    el('div', { class: 'bezig-kaart' }, el('div', { class: 'draaier' }), el('p', {}, tekst)));
  document.body.append(laag);
  return {
    tekst(t) { laag.querySelector('p').textContent = t; },
    klaar() { laag.remove(); },
  };
}

/* ---------- Vensters ---------- */
export function dialoog({ titel, inhoud, knoppen = [{ label: t('Oké'), waarde: true, primair: true }], breed = false, bijOpenen }) {
  return new Promise((resolve) => {
    const vorige = document.activeElement;
    const sluit = (waarde) => {
      document.removeEventListener('keydown', toets, true);
      laag.remove();
      if (vorige && vorige.focus) vorige.focus();
      resolve(waarde);
    };
    const toets = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); sluit(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const p = knoppen.find((k) => k.primair && !k.uit);
        if (p) { e.preventDefault(); e.stopPropagation(); sluit(typeof p.waarde === 'function' ? p.waarde() : p.waarde); }
      }
    };
    const knopRij = el('div', { class: 'venster-knoppen' },
      knoppen.map((k) => knop(k.label, {
        soort: k.primair ? 'primair' : k.gevaar ? 'gevaar' : 'gewoon',
        uit: k.uit,
        klik: () => {
          const w = typeof k.waarde === 'function' ? k.waarde() : k.waarde;
          if (w === undefined) return; // ongeldige invoer: venster blijft open
          sluit(w);
        },
      })));
    const venster = el('div', { class: `venster${breed ? ' breed' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titel },
      el('h2', {}, titel),
      el('div', { class: 'venster-inhoud' }, typeof inhoud === 'string' ? el('p', {}, inhoud) : inhoud),
      knopRij);
    const laag = el('div', { class: 'venster-laag', onmousedown: (e) => { if (e.target === laag) sluit(null); } }, venster);
    document.body.append(laag);
    document.addEventListener('keydown', toets, true);
    const eerste = venster.querySelector('input:not([type=hidden]), select, textarea') || venster.querySelector('.knop-primair');
    if (eerste) setTimeout(() => eerste.focus(), 30);
    if (bijOpenen) bijOpenen(venster, sluit);
  });
}

export async function bevestig(titel, tekst, jaLabel = t('Doorgaan'), gevaar = false) {
  return dialoog({
    titel,
    inhoud: tekst,
    knoppen: [
      { label: t('Annuleren'), waarde: false },
      { label: jaLabel, waarde: true, primair: !gevaar, gevaar },
    ],
  });
}

export async function vraagWachtwoord(naam, fout) {
  const invoer = el('input', { type: 'password', class: 'veld', autocomplete: 'off', placeholder: t('Wachtwoord') });
  return dialoog({
    titel: t('Beveiligde PDF'),
    inhoud: el('div', {},
      el('p', {}, t('"{naam}" is beveiligd met een wachtwoord. Vul het wachtwoord in om hem te openen.', { naam })),
      fout ? el('p', { class: 'fouttekst' }, fout) : null,
      invoer,
      el('p', { class: 'klein' }, t('Om hem te ontgrendelen gaat het bestand even naar je eigen server en wordt daar direct gewist.'))),
    knoppen: [
      { label: t('Annuleren'), waarde: null },
      { label: t('Openen'), primair: true, waarde: () => invoer.value },
    ],
  });
}

/* ---------- Opmaak ---------- */
export function grootte(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`;
}

export function basisNaam(naam) {
  return String(naam || 'document').replace(/\.[a-z0-9]{2,5}$/i, '');
}

export function vandaag() {
  const d = new Date();
  const scheiding = { nl: '-', de: '.', en: '/' }[taal()] || '-';
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join(scheiding);
}

/* ---------- Server ---------- */
export async function api(pad, bestand, naam, velden = {}, opnieuw = true) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(velden)) fd.append(k, v);
  fd.append('bestand', bestand instanceof Blob ? bestand : new Blob([bestand]), naam || 'bestand');
  let res;
  try {
    res = await fetch(pad, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Taal': taal() } });
  } catch (_) {
    throw new Error(t('De server is niet bereikbaar. Controleer je internetverbinding.'));
  }
  if (res.status === 401 && opnieuw) {
    // Sessie verlopen: inloggen en de klus daarna gewoon afmaken.
    const laag = document.querySelector('.bezig');
    if (laag) laag.hidden = true;
    await toonInlog();
    if (laag) laag.hidden = false;
    return api(pad, bestand, naam, velden, false);
  }
  if (!res.ok) {
    let fout = t('Er ging iets mis op de server.');
    try { fout = (await res.json()).fout || fout; } catch (_) { /* geen json */ }
    const err = new Error(fout);
    err.status = res.status;
    throw err;
  }
  return { blob: await res.blob(), headers: res.headers };
}

/* ---------- Bestanden kiezen ---------- */
const SOORTEN = {
  pdf: { omschrijving: t('PDF-bestanden'), accept: { 'application/pdf': ['.pdf'] }, input: '.pdf,application/pdf' },
  word: {
    omschrijving: t('Word-bestanden'),
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.oasis.opendocument.text': ['.odt'],
      'application/rtf': ['.rtf'],
      'text/plain': ['.txt'],
    },
    input: '.doc,.docx,.odt,.rtf,.txt',
  },
  foto: {
    omschrijving: t('Foto\'s'),
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tif', '.tiff'] },
    input: 'image/*,.heic,.heif',
  },
  pdfOfFoto: {
    omschrijving: t('PDF\'s en foto\'s'),
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'] },
    input: '.pdf,application/pdf,image/*,.heic,.heif',
  },
};

export async function kiesBestanden({ meerdere = false, soort = 'pdf' } = {}) {
  const s = SOORTEN[soort];
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: meerdere,
        id: 'bladwerk-open',
        types: [{ description: s.omschrijving, accept: s.accept }],
      });
      return Promise.all(handles.map(async (h) => ({ bestand: await h.getFile(), handle: h })));
    } catch (e) {
      if (e.name === 'AbortError') return [];
      /* val terug op het gewone venster */
    }
  }
  return new Promise((resolve) => {
    const inp = el('input', { type: 'file', accept: s.input, multiple: meerdere || null, style: { display: 'none' } });
    inp.addEventListener('change', () => {
      resolve([...inp.files].map((f) => ({ bestand: f, handle: null })));
      inp.remove();
    });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

/* ---------- Opslaan ---------- */
function downloaden(blob, naam) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: naam, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

const TYPES = {
  pdf: { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } },
  docx: { description: 'Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
  png: { description: 'PNG', accept: { 'image/png': ['.png'] } },
  jpg: { description: 'JPG', accept: { 'image/jpeg': ['.jpg'] } },
  zip: { description: 'Zip', accept: { 'application/zip': ['.zip'] } },
};

/*
 * Slaat een bestand op. In Chrome kies je zelf de plek (standaard naast
 * het origineel), in andere browsers wordt het een download.
 * Geeft de gekozen naam terug, of null als je annuleert.
 */
export async function bewaar(data, naam, { naast = null } = {}) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const ext = (naam.split('.').pop() || 'pdf').toLowerCase();
  if (window.showSaveFilePicker) {
    try {
      const opties = { suggestedName: naam, id: 'bladwerk-opslaan' };
      if (TYPES[ext]) opties.types = [TYPES[ext]];
      if (naast) { opties.startIn = naast; delete opties.id; }
      let handle;
      try {
        handle = await window.showSaveFilePicker(opties);
      } catch (e) {
        if (e.name === 'AbortError') return null;
        if (naast) { delete opties.startIn; handle = await window.showSaveFilePicker(opties); } else throw e;
      }
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      console.warn('Opslaan via venster lukte niet, ik download het bestand.', e);
    }
  }
  downloaden(blob, naam);
  return naam;
}

/* Overschrijft een bestand dat je eerder hebt geopend (alleen Chrome). */
export async function overschrijf(handle, data) {
  if (!handle || !handle.createWritable) throw new Error(t('Overschrijven kan alleen in Chrome, met een bestand dat je via Bladwerk hebt geopend.'));
  if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    const ok = await handle.requestPermission({ mode: 'readwrite' });
    if (ok !== 'granted') throw new Error(t('Je gaf geen toestemming om het origineel te overschrijven.'));
  }
  const w = await handle.createWritable();
  await w.write(data instanceof Blob ? data : new Blob([data]));
  await w.close();
}

/*
 * Meerdere bestanden opslaan: in Chrome in een map naar keuze,
 * anders als één zip-bestand.
 */
export async function bewaarMeerdere(bestanden, zipNaam, { naast = null } = {}) {
  if (window.showDirectoryPicker) {
    try {
      const opties = { mode: 'readwrite', id: 'bladwerk-map' };
      if (naast) { opties.startIn = naast; delete opties.id; }
      let map;
      try {
        map = await window.showDirectoryPicker(opties);
      } catch (e) {
        if (e.name === 'AbortError') return null;
        if (naast) { delete opties.startIn; map = await window.showDirectoryPicker(opties); } else throw e;
      }
      for (const b of bestanden) {
        const h = await map.getFileHandle(b.naam, { create: true });
        const w = await h.createWritable();
        await w.write(b.data instanceof Blob ? b.data : new Blob([b.data]));
        await w.close();
      }
      return t('{n} bestanden in map "{map}"', { n: bestanden.length, map: map.name });
    } catch (e) {
      if (e.name === 'AbortError') return null;
      console.warn('Map kiezen lukte niet, ik maak een zip.', e);
    }
  }
  const zip = new window.JSZip();
  for (const b of bestanden) zip.file(b.naam, b.data);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloaden(blob, zipNaam);
  return zipNaam;
}

export function leesAlsBytes(bestand) {
  return bestand.arrayBuffer().then((b) => new Uint8Array(b));
}

export function veilig(fn) {
  try { return fn(); } catch (_) { return null; }
}
