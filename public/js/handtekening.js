/*
 * Handtekening: één keer een foto of scan uploaden, de achtergrond wordt
 * doorzichtig gemaakt en het resultaat blijft alleen in deze browser.
 */
import { el, dialoog, melding, knop, kiesBestanden, veilig } from './hulp.js';
import { leesFoto } from './pdfbron.js';

const SLEUTEL = 'bladwerk.handtekening';

export function haalHandtekening() {
  const ruw = veilig(() => localStorage.getItem(SLEUTEL));
  if (!ruw) return null;
  try {
    const h = JSON.parse(ruw);
    return h && h.bron ? h : null;
  } catch (_) { return null; }
}

function bewaarHandtekening(h) {
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(h));
    return true;
  } catch (_) {
    melding('De handtekening kon niet in deze browser worden bewaard. Staat privé-surfen aan?', 'fout', 7000);
    return false;
  }
}

function wisHandtekening() {
  veilig(() => localStorage.removeItem(SLEUTEL));
}

/*
 * Maakt de achtergrond doorzichtig. De papierkleur wordt geschat uit de
 * lichtste delen van de foto; gevoeligheid bepaalt hoe streng.
 */
function verwerk(beeld, gevoeligheid, inkt) {
  const maxB = 1600;
  const schaal = Math.min(1, maxB / beeld.width);
  const w = Math.max(1, Math.round(beeld.width * schaal));
  const h = Math.max(1, Math.round(beeld.height * schaal));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(beeld, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Papierhelderheid: 85e percentiel van de helderheid.
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    hist[l | 0]++;
  }
  let teller = 0;
  let papier = 255;
  const doel = (px.length / 4) * 0.15;
  for (let l = 255; l >= 0; l--) { teller += hist[l]; if (teller >= doel) { papier = l; break; } }

  const marge = 18 + (100 - gevoeligheid) * 0.9; // hoe ver onder papierkleur nog als papier telt
  const zacht = 40;
  const kleuren = { zwart: [20, 20, 20], blauw: [18, 42, 120] };
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      const verschil = papier - marge - l;
      let a = verschil <= 0 ? 0 : Math.min(1, verschil / zacht);
      if (a > 0 && kleuren[inkt]) {
        const [r, g, b] = kleuren[inkt];
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
      } else if (a > 0) {
        // Origineel: inkt iets donkerder maken zodat hij goed zichtbaar is.
        px[i] = px[i] * 0.8; px[i + 1] = px[i + 1] * 0.8; px[i + 2] = px[i + 2] * 0.8;
      }
      px[i + 3] = Math.round(a * 255);
      if (a > 0.3) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const uitSchaal = Math.min(1, 1000 / cw);
  const uit = document.createElement('canvas');
  uit.width = Math.round(cw * uitSchaal);
  uit.height = Math.round(ch * uitSchaal);
  uit.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, uit.width, uit.height);
  return { bron: uit.toDataURL('image/png'), breedte: uit.width, hoogte: uit.height };
}

export async function stelHandtekeningIn() {
  const huidig = haalHandtekening();
  let beeld = null;
  let resultaat = huidig;
  let gevoeligheid = 60;
  let inkt = 'origineel';

  const voorbeeld = el('div', { class: 'handtekening-voorbeeld' });
  const toonVoorbeeld = () => {
    voorbeeld.innerHTML = '';
    if (resultaat) voorbeeld.append(el('img', { src: resultaat.bron, alt: 'Voorbeeld van je handtekening' }));
    else voorbeeld.append(el('p', { class: 'klein' }, beeld ? 'Geen handtekening gevonden. Zet de gevoeligheid hoger.' : 'Nog geen handtekening ingesteld.'));
  };
  const herbereken = () => {
    if (!beeld) return;
    resultaat = verwerk(beeld, gevoeligheid, inkt);
    toonVoorbeeld();
  };

  const schuif = el('input', { type: 'range', min: 0, max: 100, value: gevoeligheid, class: 'schuif' });
  schuif.addEventListener('input', () => { gevoeligheid = Number(schuif.value); herbereken(); });
  const inktKeuze = el('select', { class: 'veld' },
    el('option', { value: 'origineel' }, 'Kleur zoals op de foto'),
    el('option', { value: 'zwart' }, 'Zwart'),
    el('option', { value: 'blauw' }, 'Donkerblauw'));
  inktKeuze.addEventListener('change', () => { inkt = inktKeuze.value; herbereken(); });
  const instellingen = el('div', { class: 'handtekening-instellingen', hidden: true },
    el('label', { class: 'label' }, 'Gevoeligheid', schuif),
    el('label', { class: 'label' }, 'Inktkleur', inktKeuze));

  const kies = knop('Foto of scan kiezen', {
    icoon: 'foto',
    klik: async () => {
      const [k] = await kiesBestanden({ soort: 'foto' });
      if (!k) return;
      try {
        const foto = await leesFoto(k.bestand);
        beeld = await createImageBitmap(new Blob([foto.bytes], { type: foto.type === 'png' ? 'image/png' : 'image/jpeg' }));
        instellingen.hidden = false;
        herbereken();
      } catch (err) {
        melding(err.message, 'fout');
      }
    },
  });

  toonVoorbeeld();
  const inhoud = el('div', {},
    el('p', {}, 'Zet je handtekening met een donkere pen op wit papier en maak er een foto of scan van. Bladwerk maakt de achtergrond doorzichtig en bewaart hem alleen in deze browser op je eigen computer.'),
    kies,
    instellingen,
    voorbeeld);

  const knoppen = [{ label: 'Annuleren', waarde: 'annuleren' }];
  if (huidig) knoppen.unshift({ label: 'Verwijderen', waarde: 'wissen', gevaar: true });
  knoppen.push({ label: 'Bewaren', waarde: 'bewaren', primair: true });

  const keuze = await dialoog({ titel: 'Handtekening instellen', inhoud, knoppen });
  if (keuze === 'wissen') {
    wisHandtekening();
    melding('Je handtekening is uit deze browser verwijderd.');
    return null;
  }
  if (keuze === 'bewaren' && resultaat && resultaat !== huidig) {
    if (bewaarHandtekening(resultaat)) melding('Je handtekening is bewaard.', 'goed');
    return resultaat;
  }
  return keuze === 'bewaren' ? huidig : null;
}
