/* Snelle klussen vanaf de startpagina: één ding doen en opslaan. */
import { t } from './i18n.js';
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
        el('button', { type: 'button', class: 'knop-icoon', title: t('Omhoog'), disabled: i === 0 || null, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; teken(); } }, icoon('omhoog', 16)),
        el('button', { type: 'button', class: 'knop-icoon', title: t('Omlaag'), disabled: i === items.length - 1 || null, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; teken(); } }, icoon('omlaag', 16)),
        el('button', { type: 'button', class: 'knop-icoon', title: t('Weghalen'), onclick: () => { items.splice(i, 1); teken(); } }, icoon('sluiten', 16))));
    });
  };
  teken();
  const toevoegen = opToevoegen ? knop(t('Meer toevoegen'), { icoon: 'toevoegen', class: 'knop-klein', klik: async () => { await opToevoegen(items); teken(); } }) : null;
  return el('div', {}, lijst, toevoegen);
}

export async function samenvoegen({ openInWerkruimte }) {
  const gekozen = await kiesBestanden({ meerdere: true, soort: 'pdf' });
  if (!gekozen.length) return;
  const b = bezig(t('Bestanden lezen…'));
  const items = [];
  const lees = async (lijst) => {
    for (const k of lijst) {
      try {
        const r = await leesPdf(k);
        if (r) items.push({ ...r, extra: t('{n} p.', { n: r.aantal }) });
      } catch (err) { melding(err.message, 'fout', 7000); }
    }
  };
  try { await lees(gekozen); } finally { b.klaar(); }
  if (!items.length) return;
  const keuze = await dialoog({
    titel: t('Samenvoegen'),
    breed: true,
    inhoud: el('div', {},
      el('p', {}, t('Zet de bestanden in de goede volgorde. Ze worden in deze volgorde achter elkaar gezet.')),
      ordenLijst(items, { opToevoegen: async (it) => { const extra = await kiesBestanden({ meerdere: true, soort: 'pdf' }); const bb = bezig(t('Lezen…')); try { await lees(extra); } finally { bb.klaar(); } void it; } })),
    knoppen: [
      { label: t('Annuleren'), waarde: null },
      { label: t('Openen in werkruimte'), waarde: 'werkruimte' },
      { label: t('Samenvoegen en opslaan'), waarde: 'opslaan', primair: true },
    ],
  });
  if (!keuze || !items.length) return;
  if (keuze === 'werkruimte') {
    openInWerkruimte(items.map((it) => ({ bestand: new File([it.bytes], it.naam, { type: 'application/pdf' }), handle: null })));
    return;
  }
  const bb = bezig(t('Samenvoegen…'));
  try {
    const staat = { bronnen: {}, paginas: [], aantekeningen: {}, formulier: {} };
    items.forEach((it, n) => {
      staat.bronnen[`b${n}`] = { bytes: it.bytes };
      for (let i = 0; i < it.aantal; i++) staat.paginas.push({ id: `p${n}-${i}`, bron: `b${n}`, index: i, draai: 0 });
    });
    const data = await bouwPdf(PDFLib, staat, { ...BOUW_OPTIES, titel: basisNaam(items[0].naam) });
    bb.klaar();
    const naam = await bewaar(data, `${basisNaam(items[0].naam)} (${t('samengevoegd')}).pdf`, { naast: items[0].handle });
    if (naam) melding(t('{n} bestanden samengevoegd tot "{naam}" ({grootte}).', { n: items.length, naam, grootte: grootte(data.length) }), 'goed', 6000);
  } catch (err) {
    bb.klaar();
    melding(err.message, 'fout', 7000);
  }
}

export async function splitsen() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  let pdf;
  const b = bezig(t('Lezen…'));
  try { pdf = await leesPdf(k); } catch (err) { melding(err.message, 'fout'); } finally { b.klaar(); }
  if (!pdf) return;
  const n = pdf.aantal;
  if (n < 2) { melding(t('Dit document heeft maar één pagina.'), 'info'); return; }
  const r1 = el('input', { type: 'radio', name: 'wijze', value: 'elk', checked: true });
  const r2 = el('input', { type: 'radio', name: 'wijze', value: 'per' });
  const r3 = el('input', { type: 'radio', name: 'wijze', value: 'zelf' });
  const per = el('input', { type: 'number', class: 'veld veld-smal', min: 1, max: n, value: Math.min(2, n) });
  const zelf = el('input', { type: 'text', class: 'veld', placeholder: t('bijv. 1-3, 4-7, 8') });
  per.addEventListener('focus', () => { r2.checked = true; });
  zelf.addEventListener('focus', () => { r3.checked = true; });
  const fout = el('p', { class: 'fouttekst', hidden: true });
  const keuze = await dialoog({
    titel: t('Splitsen: {naam}', { naam: pdf.naam }),
    inhoud: el('div', {},
      el('p', {}, t('Dit document heeft {n} pagina\'s. Hoe wil je het opsplitsen?', { n })),
      el('label', { class: 'keuzelabel' }, r1, t('Elke pagina een eigen bestand')),
      el('label', { class: 'keuzelabel' }, r2, t('Steeds'), per, t('pagina\'s per bestand')),
      el('label', { class: 'keuzelabel' }, r3, t('Zelf kiezen:'), zelf),
      el('p', { class: 'klein' }, t('Bij zelf kiezen wordt elk stuk tussen komma\'s een apart bestand. "8-eind" mag ook.')),
      fout),
    knoppen: [
      { label: t('Annuleren'), waarde: null },
      {
        label: t('Splitsen en opslaan'), primair: true,
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
  const bb = bezig(t('Splitsen…'));
  try {
    const delen = await splitsPdf(PDFLib, pdf.bytes, keuze);
    const basis = basisNaam(pdf.naam);
    const breed = String(n).length;
    const bestanden = delen.map((data, i) => {
      const g = keuze[i];
      const label = g.length === 1 ? t('pagina {n}', { n: String(g[0] + 1).padStart(breed, '0') }) : t('pagina\'s {van}-{tot}', { van: g[0] + 1, tot: g[g.length - 1] + 1 });
      return { naam: `${basis} – ${label}.pdf`, data };
    });
    bb.klaar();
    const uit = bestanden.length === 1 ? await bewaar(bestanden[0].data, bestanden[0].naam, { naast: k.handle }) : await bewaarMeerdere(bestanden, `${basis} – ${t('gesplitst')}.zip`, { naast: k.handle });
    if (uit) melding(t('Gesplitst in {n} bestanden: {uit}.', { n: bestanden.length, uit }), 'goed', 6000);
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
      b.tekst(lijst.length > 1 ? t('{tekst} ({i} van {n})', { tekst: bezigTekst, i: i + 1, n: lijst.length }) : bezigTekst);
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
    : await bewaarMeerdere(uit, `${t('Omgezet')}.zip`, { naast: uit[0].handle });
  if (resultaat) melding(t('Opgeslagen: {uit}.', { uit: resultaat }), 'goed', 6000);
}

export const wordNaarPdf = () => zetOmViaServer({ soort: 'word', pad: '/api/word-naar-pdf', nieuweExt: 'pdf', bezigTekst: t('Omzetten naar PDF…') });
export const pdfNaarWord = () => zetOmViaServer({ soort: 'pdf', pad: '/api/pdf-naar-word', nieuweExt: 'docx', bezigTekst: t('Omzetten naar Word…') });

export async function fotosNaarPdf({ openInWerkruimte }) {
  const gekozen = await kiesBestanden({ meerdere: true, soort: 'foto' });
  if (!gekozen.length) return;
  const items = gekozen.map((k) => ({ naam: k.bestand.name, bestand: k.bestand, extra: grootte(k.bestand.size) }));
  const formaat = el('select', { class: 'veld' },
    el('option', { value: 'a4' }, t('Op A4-pagina\'s (aanbevolen)')),
    el('option', { value: 'foto' }, t('Pagina zo groot als de foto')));
  const keuze = await dialoog({
    titel: t('Foto\'s naar PDF'),
    breed: true,
    inhoud: el('div', {},
      el('p', {}, t('Elke foto wordt een pagina, in deze volgorde. Foto\'s worden automatisch rechtop gezet.')),
      ordenLijst(items, {
        opToevoegen: async (it) => {
          const extra = await kiesBestanden({ meerdere: true, soort: 'foto' });
          for (const k of extra) it.push({ naam: k.bestand.name, bestand: k.bestand, extra: grootte(k.bestand.size) });
        },
      }),
      el('label', { class: 'label' }, t('Paginaformaat'), formaat)),
    knoppen: [
      { label: t('Annuleren'), waarde: null },
      { label: t('Openen in werkruimte'), waarde: 'werkruimte' },
      { label: t('PDF maken en opslaan'), waarde: 'opslaan', primair: true },
    ],
  });
  if (!keuze || !items.length) return;
  const b = bezig(t('PDF maken van je foto\'s…'));
  try {
    const data = await fotosAlsPdf(items.map((i) => i.bestand), { paginaFormaat: formaat.value });
    const naam = items.length === 1 ? basisNaam(items[0].naam) : t('Foto\'s');
    b.klaar();
    if (keuze === 'werkruimte') {
      openInWerkruimte([{ bestand: new File([data], `${naam}.pdf`, { type: 'application/pdf' }), handle: null }]);
      return;
    }
    const uit = await bewaar(data, `${naam}.pdf`, { naast: gekozen[0].handle });
    if (uit) melding(t('Opgeslagen als "{naam}" ({grootte}).', { naam: uit, grootte: grootte(data.length) }), 'goed');
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 7000);
  }
}

export async function pdfNaarPlaatjes() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const soort = el('select', { class: 'veld' }, el('option', { value: 'png' }, t('PNG (scherp, groter)')), el('option', { value: 'jpg' }, t('JPG (kleiner)')));
  const dpi = el('select', { class: 'veld' }, el('option', { value: '150' }, t('150 dpi (scherm)')), el('option', { value: '300' }, t('300 dpi (afdrukken)')));
  const ok = await dialoog({
    titel: t('PDF naar afbeeldingen'),
    inhoud: el('div', {}, el('p', {}, t('Elke pagina van "{naam}" wordt een afbeelding.', { naam: k.bestand.name })),
      el('label', { class: 'label' }, t('Soort'), soort), el('label', { class: 'label' }, t('Scherpte'), dpi)),
    knoppen: [{ label: t('Annuleren'), waarde: null }, { label: t('Opslaan'), waarde: true, primair: true }],
  });
  if (!ok) return;
  const b = bezig(t('Afbeeldingen maken…'));
  try {
    const pdf = await leesPdf(k);
    if (!pdf) { b.klaar(); return; }
    const bestanden = await pdfNaarAfbeeldingen(pdf.bytes, soort.value, Number(dpi.value), basisNaam(k.bestand.name), (i, n) => b.tekst(t('Pagina {i} van {n}…', { i, n })));
    b.klaar();
    const uit = bestanden.length === 1 ? await bewaar(bestanden[0].data, bestanden[0].naam, { naast: k.handle }) : await bewaarMeerdere(bestanden, `${basisNaam(k.bestand.name)} – ${t('afbeeldingen')}.zip`, { naast: k.handle });
    if (uit) melding(t('Opgeslagen: {uit}.', { uit }), 'goed');
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout');
  }
}

export async function doorzoekbaar() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const b = bezig(t('Tekst herkennen… dit kan bij veel pagina\'s een paar minuten duren'));
  try {
    const { blob } = await api('/api/doorzoekbaar', k.bestand, k.bestand.name);
    b.klaar();
    const uit = await bewaar(blob, `${basisNaam(k.bestand.name)} (${t('doorzoekbaar')}).pdf`, { naast: k.handle });
    if (uit) melding(t('Opgeslagen als "{naam}". Je kunt nu zoeken en tekst kopiëren.', { naam: uit }), 'goed', 6000);
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 8000);
  }
}

export async function verkleinen() {
  const [k] = await kiesBestanden({ soort: 'pdf' });
  if (!k) return;
  const standen = [
    ['email', t('Voor e-mail'), t('Goed leesbaar op scherm en meestal ruim onder 10 MB.')],
    ['scherm', t('Voor scherm'), t('Zo klein mogelijk; foto\'s worden wat minder scherp.')],
    ['druk', t('Voor drukwerk'), t('Afbeeldingen blijven 300 dpi; geschikt voor de drukker.')],
  ];
  const radios = standen.map(([v], i) => el('input', { type: 'radio', name: 'stand', value: v, checked: i === 0 || null }));
  const keuze = await dialoog({
    titel: t('Verkleinen: {naam}', { naam: k.bestand.name }),
    inhoud: el('div', {},
      el('p', {}, t('Nu {grootte}. Waarvoor wil je het bestand gebruiken?', { grootte: grootte(k.bestand.size) })),
      standen.map(([, label, uitleg], i) => el('label', { class: 'keuzelabel keuze-blok' }, radios[i], el('span', {}, el('strong', {}, label), el('br'), el('span', { class: 'klein' }, uitleg))))),
    knoppen: [{ label: t('Annuleren'), waarde: null }, { label: t('Verkleinen'), primair: true, waarde: () => radios.find((r) => r.checked).value }],
  });
  if (!keuze) return;
  const b = bezig(t('Verkleinen…'));
  try {
    const { blob, headers } = await api(`/api/verkleinen?stand=${keuze}`, k.bestand, k.bestand.name);
    b.klaar();
    if (headers.get('X-Origineel-Behouden') === '1') {
      melding(t('Dit bestand kan in deze stand niet kleiner. Probeer eventueel "Voor e-mail" of "Voor scherm".'), 'info', 7000);
      return;
    }
    const voor = Number(headers.get('X-Grootte-Voor'));
    const na = Number(headers.get('X-Grootte-Na'));
    const uit = await bewaar(blob, `${basisNaam(k.bestand.name)} (${t('verkleind')}).pdf`, { naast: k.handle });
    if (uit) melding(t('Van {voor} naar {na} ({p}% kleiner). Opgeslagen als "{naam}".', { voor: grootte(voor), na: grootte(na), p: Math.round((1 - na / voor) * 100), naam: uit }), 'goed', 7000);
  } catch (err) {
    b.klaar();
    melding(err.message, 'fout', 8000);
  }
}

export async function handtekeningInstellen() {
  await stelHandtekeningIn();
}
