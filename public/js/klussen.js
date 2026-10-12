/* Snelle klussen vanaf de startpagina: één ding doen en opslaan. */
import { PDFLib, maakBewerkbaar, fotosAlsPdf, BOUW_OPTIES } from './pdfbron.js';
import { bouwPdf, splitsPdf, leesBereiken } from './bouwen.js';
import {
  el, knop, icoon, melding, bezig, dialoog, api, grootte, basisNaam,
  kiesBestanden, bewaar, bewaarMeerdere, leesAlsBytes,
} from './hulp.js';
import { pdfNaarAfbeeldingen } from './werkruimte.js';
import { stelHandtekeningIn } from './handtekening.js';

async function leesPdf(k) {
  const bytes = await leesAlsBytes(k.bestand);
  const res = await maakBewerkbaar(bytes, k.bestand.name);
  return res ? { ...res, naam: k.bestand.name, handle: k.handle } : null;
}

/* Een lijst die je kunt ordenen (samenvoegen, foto's). */
function ordenLijst(items, { opToevoegen } = {}) {
  const lijst = el('ol', { class: 'orden-lijst' });
  const teken = () => {
    lijst.innerHTML = '';
    items.forEach((it, i) => {
      lijst.append(el('li', {},
        el('span', { class: 'orden-naam', title: it.naam }, it.naam),
        el('span', { class: 'orden-extra' }, it.extra || ''),
        el('button', { type: 'button', class: 'knop-icoon', title: 'Omhoog', disabled: i === 0 || null, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; teken(); } }, icoon('omhoog', 16)),
        el('button', { type: 'button', class: 'knop-icoon', title: 'Omlaag', disabled: i === items.length - 1 || null, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; teken(); } }, icoon('omlaag', 16)),
        el('button', { type: 'button', class: 'knop-icoon', title: 'Weghalen', onclick: () => { items.splice(i, 1); teken(); } }, icoon('sluiten', 16))));
    });
  };
  teken();
  const toevoegen = opToevoegen ? knop('Meer toevoegen', { icoon: 'toevoegen', class: 'knop-klein', klik: async () => { await opToevoegen(items); teken(); } }) : null;
  return el('div', {}, lijst, toevoegen);
}

export async function samenvoegen({ openInWerkruimte }) {
  const gekozen = await kiesBestanden({ meerdere: true, soort: 'pdf' });
  if (!gekozen.length) return;
  const b = bezig('Bestanden lezen…');
  const items = [];
  const lees = async (lijst) => {
    for (const k of lijst) {
      try {
        const r = await leesPdf(k);
        if (r) items.push({ ...r, extra: `${r.aantal} p.` });
      } catch (err) { melding(err.message, 'fout', 7000); }
    }
  };
  try { await lees(gekozen); } finally { b.klaar(); }
  if (!items.length) return;
  const keuze = await dialoog({
    titel: 'Samenvoegen',
    breed: true,
    inhoud: el('div', {},
      el('p', {}, 'Zet de bestanden in de goede volgorde. Ze worden in deze volgorde achter elkaar gezet.'),
      ordenLijst(items, { opToevoegen: async (it) => { const extra = await kiesBestanden({ meerdere: true, soort: 'pdf' }); const bb = bezig('Lezen…'); try { await lees(extra); } finally { bb.klaar(); } void it; } })),
    knoppen: [
      { label: 'Annuleren', waarde: null },
      { label: 'Openen in werkruimte', waarde: 'werkruimte' },
      { label: 'Samenvoegen en opslaan', waarde: 'opslaan', primair: true },
    ],
  });
  if (!keuze || !items.length) return;
  if (keuze === 'werkruimte') {
    openInWerkruimte(items.map((it) => ({ bestand: new File([it.bytes], it.naam, { type: 'application/pdf' }), handle: null })));
    return;
  }
  const bb = bezig('Samenvoegen…');
  try {
    const staat = { bronnen: {}, paginas: [], aantekeningen: {}, formulier: {} };
    items.forEach((it, n) => {
      staat.bronnen[`b${n}`] = { bytes: it.bytes };
      for (let i = 0; i < it.aantal; i++) staat.paginas.push({ id: `p${n}-${i}`, bron: `b${n}`, index: i, draai: 0 });
    });
    const data = await bouwPdf(PDFLib, staat, { ...BOUW_OPTIES, titel: basisNaam(items[0].naam) });
    bb.klaar();
    const naam = await bewaar(data, `${basisNaam(items[0].naam)} (samengevoegd).pdf`, { naast: items[0].handle });
    if (naam) melding(`${items.length} bestanden samengevoegd tot "${naam}" (${data.length ? grootte(data.length) : ''}).`, 'goed', 6000);
  } catch (err) {
    bb.klaar();
    melding(err.message, 'fout', 7000);
  }
}

export async function splitsen() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  let pdf;
  const b = bezig('Lezen…');
  try { pdf = await leesPdf(k); } catch (err) { melding(err.message, 'fout'); } finally { b.klaar(); }
  if (!pdf) return;
  const n = pdf.aantal;
  if (n < 2) { melding('Dit document heeft maar één pagina.', 'info'); return; }
  const r1 = el('input', { type: 'radio', name: 'wijze', value: 'elk', checked: true });
  const r2 = el('input', { type: 'radio', name: 'wijze', value: 'per' });
  const r3 = el('input', { type: 'radio', name: 'wijze', value: 'zelf' });
  const per = el('input', { type: 'number', class: 'veld veld-smal', min: 1, max: n, value: Math.min(2, n) });
  const zelf = el('input', { type: 'text', class: 'veld', placeholder: 'bijv. 1-3, 4-7, 8' });
  per.addEventListener('focus', () => { r2.checked = true; });
  zelf.addEventListener('focus', () => { r3.checked = true; });
  const fout = el('p', { class: 'fouttekst', hidden: true });
  const keuze = await dialoog({
    titel: `Splitsen: ${pdf.naam}`,
    inhoud: el('div', {},
      el('p', {}, `Dit document heeft ${n} pagina's. Hoe wil je het opsplitsen?`),
      el('label', { class: 'keuzelabel' }, r1, 'Elke pagina een eigen bestand'),
      el('label', { class: 'keuzelabel' }, r2, 'Steeds', per, 'pagina\'s per bestand'),
      el('label', { class: 'keuzelabel' }, r3, 'Zelf kiezen:', zelf),
      el('p', { class: 'klein' }, 'Bij zelf kiezen wordt elk stuk tussen komma\'s een apart bestand. "8-eind" mag ook.'),
      fout),
    knoppen: [
      { label: 'Annuleren', waarde: null },
      {
        label: 'Splitsen en opslaan', primair: true,
        waarde: () => {
          try {
            if (r1.checked) return [...Array(n).keys()].map((i) => [i]);
            if (r2.checked) {
              const s = Math.max(1, Math.min(n, parseInt(per.value, 10) || 1));
              const g = [];
              for (let i = 0; i < n; i += s) g.push([...Array(Math.min(s, n - i)).keys()].map((j) => i + j));
              return g;
            }
            return leesBereiken(zelf.value, n);
          } catch (err) {
            fout.textContent = err.message;
            fout.hidden = false;
            return undefined;
          }
        },
      },
    ],
  });
  if (!keuze) return;
  const bb = bezig('Splitsen…');
  try {
    const delen = await splitsPdf(PDFLib, pdf.bytes, keuze);
    const basis = basisNaam(pdf.naam);
    const breed = String(n).length;
    const bestanden = delen.map((data, i) => {
      const g = keuze[i];
      const label = g.length === 1 ? `pagina ${String(g[0] + 1).padStart(breed, '0')}` : `pagina's ${g[0] + 1}-${g[g.length - 1] + 1}`;
      return { naam: `${basis} – ${label}.pdf`, data };
    });
    bb.klaar();
    const uit = bestanden.length === 1 ? await bewaar(bestanden[0].data, bestanden[0].naam, { naast: k.handle }) : await bewaarMeerdere(bestanden, `${basis} – gesplitst.zip`, { naast: k.handle });
    if (uit) melding(`Gesplitst in ${bestanden.length} bestanden: ${uit}.`, 'goed', 6000);
  } catch (err) {
    bb.klaar();
    melding(err.message, 'fout');
  }
}

async function zetOmViaServer({ soort, pad, nieuweExt, bezigTekst }) {
  const lijst = await kiesBestanden({ meerdere: true, soort });
  if (!lijst.length) return;
  const b = bezig(bezigTekst);
  const uit = [];
  try {
    for (const [i, k] of lijst.entries()) {
      b.tekst(lijst.length > 1 ? `${bezigTekst} (${i + 1} van ${lijst.length})` : bezigTekst);
      try {
        const { blob } = await api(pad, k.bestand, k.bestand.name);
        uit.push({ naam: `${basisNaam(k.bestand.name)}.${nieuweExt}`, data: blob, handle: k.handle });
      } catch (err) {
        melding(`${k.bestand.name}: ${err.message}`, 'fout', 8000);
      }
    }
  } finally {
    b.klaar();
  }
  if (!uit.length) return;
  const resultaat = uit.length === 1
    ? await bewaar(uit[0].data, uit[0].naam, { naast: uit[0].handle })
    : await bewaarMeerdere(uit, `Omgezet.zip`, { naast: uit[0].handle });
  if (resultaat) melding(`Opgeslagen: ${resultaat}.`, 'goed', 6000);
}

export const wordNaarPdf = () => zetOmViaServer({ soort: 'word', pad: '/api/word-naar-pdf', nieuweExt: 'pdf', bezigTekst: 'Omzetten naar PDF…' });
export const pdfNaarWord = () => zetOmViaServer({ soort: 'pdf', pad: '/api/pdf-naar-word', nieuweExt: 'docx', bezigTekst: 'Omzetten naar Word…' });

export async function fotosNaarPdf({ openInWerkruimte }) {
  const gekozen = await kiesBestanden({ meerdere: true, soort: 'foto' });
  if (!gekozen.length) return;
  const items = gekozen.map((k) => ({ naam: k.bestand.name, bestand: k.bestand, extra: grootte(k.bestand.size) }));
  const formaat = el('select', { class: 'veld' },
    el('option', { value: 'a4' }, 'Op A4-pagina\'s (aanbevolen)'),
    el('option', { value: 'foto' }, 'Pagina zo groot als de foto'));
  const keuze = await dialoog({
    titel: 'Foto\'s naar PDF',
    breed: true,
    inhoud: el('div', {},
      el('p', {}, 'Elke foto wordt een pagina, in deze volgorde. Foto\'s worden automatisch rechtop gezet.'),
      ordenLijst(items, {
        opToevoegen: async (it) => {
          const extra = await kiesBestanden({ meerdere: true, soort: 'foto' });
          for (const k of extra) it.push({ naam: k.bestand.name, bestand: k.bestand, extra: grootte(k.bestand.size) });
        },
      }),
      el('label', { class: 'label' }, 'Paginaformaat', formaat)),
    knoppen: [
      { label: 'Annuleren', waarde: null },
      { label: 'Openen in werkruimte', waarde: 'werkruimte' },
      { label: 'PDF maken en opslaan', waarde: 'opslaan', primair: true },
    ],
  });
  if (!keuze || !items.length) return;
  const b = bezig('PDF maken van je foto\'s…');
  try {
    const data = await fotosAlsPdf(items.map((i) => i.bestand), { paginaFormaat: formaat.value });
    const naam = items.length === 1 ? basisNaam(items[0].naam) : 'Foto\'s';
    b.klaar();
    if (keuze === 'werkruimte') {
      openInWerkruimte([{ bestand: new File([data], `${naam}.pdf`, { type: 'application/pdf' }), handle: null }]);
      return;
    }
    const uit = await bewaar(data, `${naam}.pdf`, { naast: gekozen[0].handle });
    if (uit) melding(`Opgeslagen als "${uit}" (${grootte(data.length)}).`, 'goed');
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 7000);
  }
}

export async function pdfNaarPlaatjes() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const soort = el('select', { class: 'veld' }, el('option', { value: 'png' }, 'PNG (scherp, groter)'), el('option', { value: 'jpg' }, 'JPG (kleiner)'));
  const dpi = el('select', { class: 'veld' }, el('option', { value: '150' }, '150 dpi (scherm)'), el('option', { value: '300' }, '300 dpi (afdrukken)'));
  const ok = await dialoog({
    titel: 'PDF naar afbeeldingen',
    inhoud: el('div', {}, el('p', {}, `Elke pagina van "${k.bestand.name}" wordt een afbeelding.`),
      el('label', { class: 'label' }, 'Soort', soort), el('label', { class: 'label' }, 'Scherpte', dpi)),
    knoppen: [{ label: 'Annuleren', waarde: null }, { label: 'Opslaan', waarde: true, primair: true }],
  });
  if (!ok) return;
  const b = bezig('Afbeeldingen maken…');
  try {
    const pdf = await leesPdf(k);
    if (!pdf) { b.klaar(); return; }
    const bestanden = await pdfNaarAfbeeldingen(pdf.bytes, soort.value, Number(dpi.value), basisNaam(k.bestand.name), (i, n) => b.tekst(`Pagina ${i} van ${n}…`));
    b.klaar();
    const uit = bestanden.length === 1 ? await bewaar(bestanden[0].data, bestanden[0].naam, { naast: k.handle }) : await bewaarMeerdere(bestanden, `${basisNaam(k.bestand.name)} – afbeeldingen.zip`, { naast: k.handle });
    if (uit) melding(`Opgeslagen: ${uit}.`, 'goed');
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout');
  }
}

export async function doorzoekbaar() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const b = bezig('Tekst herkennen… dit kan bij veel pagina\'s een paar minuten duren');
  try {
    const { blob } = await api('/api/doorzoekbaar', k.bestand, k.bestand.name);
    b.klaar();
    const uit = await bewaar(blob, `${basisNaam(k.bestand.name)} (doorzoekbaar).pdf`, { naast: k.handle });
    if (uit) melding(`Opgeslagen als "${uit}". Je kunt nu zoeken en tekst kopiëren.`, 'goed', 6000);
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 8000);
  }
}

export async function verkleinen() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const standen = [
    ['email', 'Voor e-mail', 'Goed leesbaar op scherm en meestal ruim onder 10 MB.'],
    ['scherm', 'Voor scherm', 'Zo klein mogelijk; foto\'s worden wat minder scherp.'],
    ['druk', 'Voor drukwerk', 'Afbeeldingen blijven 300 dpi; geschikt voor de drukker.'],
  ];
  const radios = standen.map(([v], i) => el('input', { type: 'radio', name: 'stand', value: v, checked: i === 0 || null }));
  const keuze = await dialoog({
    titel: `Verkleinen: ${k.bestand.name}`,
    inhoud: el('div', {},
      el('p', {}, `Nu ${grootte(k.bestand.size)}. Waarvoor wil je het bestand gebruiken?`),
      standen.map(([, label, uitleg], i) => el('label', { class: 'keuzelabel keuze-blok' }, radios[i], el('span', {}, el('strong', {}, label), el('br'), el('span', { class: 'klein' }, uitleg))))),
    knoppen: [{ label: 'Annuleren', waarde: null }, { label: 'Verkleinen', primair: true, waarde: () => radios.find((r) => r.checked).value }],
  });
  if (!keuze) return;
  const b = bezig('Verkleinen…');
  try {
    const { blob, headers } = await api(`/api/verkleinen?stand=${keuze}`, k.bestand, k.bestand.name);
    b.klaar();
    if (headers.get('X-Origineel-Behouden') === '1') {
      melding('Dit bestand kan in deze stand niet kleiner. Probeer eventueel "Voor e-mail" of "Voor scherm".', 'info', 7000);
      return;
    }
    const voor = Number(headers.get('X-Grootte-Voor'));
    const na = Number(headers.get('X-Grootte-Na'));
    const uit = await bewaar(blob, `${basisNaam(k.bestand.name)} (verkleind).pdf`, { naast: k.handle });
    if (uit) melding(`Van ${grootte(voor)} naar ${grootte(na)} (${Math.round((1 - na / voor) * 100)}% kleiner). Opgeslagen als "${uit}".`, 'goed', 7000);
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 8000);
  }
}

export async function handtekeningInstellen() {
  await stelHandtekeningIn();
}
