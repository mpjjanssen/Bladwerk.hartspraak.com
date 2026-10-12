/*
 * Bouwt een nieuwe PDF uit de huidige stand van de werkruimte:
 * pagina's (volgorde, draaiing), ingevulde formulieren en aantekeningen.
 *
 * Coördinaten van aantekeningen zijn punten (1/72 inch) vanaf de
 * linkerbovenhoek van de pagina zoals je hem op het scherm ziet,
 * dus inclusief draaiing.
 *
 * Dit bestand werkt zowel in de browser als in Node (voor de tests):
 * pdf-lib en fontkit worden van buitenaf aangereikt.
 */

export const LETTERS = {
  helv: { std: 'Helvetica', bold: 'HelveticaBold', css: "'Arimo', Arial, Helvetica, sans-serif", basis: 0.947 },
  times: { std: 'TimesRoman', bold: 'TimesRomanBold', css: "'Tinos', 'Times New Roman', Times, serif", basis: 0.937 },
  courier: { std: 'Courier', bold: 'CourierBold', css: "'Cousine', 'Courier New', Courier, monospace", basis: 0.866 },
};
export const REGELHOOGTE = 1.2;

export function hexNaarRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* Schermpunt (vanaf linksboven, gedraaide weergave) naar PDF-gebruikersruimte. */
export function naarPdf(px, py, box, rot) {
  const { x0, y0, w, h } = box;
  switch (rot) {
    case 90: return [x0 + py, y0 + px];
    case 180: return [x0 + w - px, y0 + py];
    case 270: return [x0 + w - py, y0 + h - px];
    default: return [x0 + px, y0 + h - py];
  }
}

/* Afmetingen van de pagina zoals je hem ziet. */
export function schermMaat(box, rot) {
  return rot === 90 || rot === 270 ? { w: box.h, h: box.w } : { w: box.w, h: box.h };
}

function dataUrlNaarBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/*
 * Lettertypen: standaardletters waar het kan, anders (bij tekens die
 * daar niet in zitten) een ingesloten Unicode-letter.
 */
class Letterkast {
  constructor(lib, doc, laadUnicodeLetter) {
    this.lib = lib;
    this.doc = doc;
    this.laadUnicodeLetter = laadUnicodeLetter;
    this.cache = new Map();
  }
  async std(naam) {
    if (!this.cache.has(naam)) this.cache.set(naam, await this.doc.embedFont(this.lib.StandardFonts[naam]));
    return this.cache.get(naam);
  }
  async unicode() {
    if (!this.cache.has('__unicode')) {
      const bytes = await this.laadUnicodeLetter();
      this.cache.set('__unicode', await this.doc.embedFont(bytes, { subset: true }));
    }
    return this.cache.get('__unicode');
  }
  async voor(tekst, letter, vet) {
    const def = LETTERS[letter] || LETTERS.helv;
    const font = await this.std(vet ? def.bold : def.std);
    try {
      font.encodeText(tekst);
      return font;
    } catch (_) {
      if (!this.laadUnicodeLetter) throw new Error('Tekst bevat tekens die niet ondersteund worden.');
      return this.unicode();
    }
  }
}

async function tekenTekstblok(page, kast, lib, a, box, rot, opts = {}) {
  const regels = String(a.tekst || '').split('\n');
  const grootte = a.grootte || 12;
  const def = LETTERS[a.letter] || LETTERS.helv;
  const kleur = lib.rgb(...hexNaarRgb(a.kleur || '#000000'));
  const font = await kast.voor(regels.join(''), a.letter, a.vet);
  const eerste = opts.basislijn != null ? opts.basislijn : a.y + def.basis * grootte;
  regels.forEach((regel, i) => {
    if (!regel) return;
    const by = eerste + i * grootte * REGELHOOGTE;
    const [x, y] = naarPdf(a.x, by, box, rot);
    page.drawText(regel, { x, y, size: grootte, font, color: kleur, rotate: lib.degrees(rot) });
  });
}

function rechthoek(page, lib, a, box, rot, opties) {
  const [x, y] = naarPdf(a.x, a.y + a.h, box, rot);
  page.drawRectangle({ x, y, width: a.w, height: a.h, rotate: lib.degrees(rot), ...opties });
}

function opmerkingToevoegen(page, lib, a, box, rot, auteur) {
  const { PDFHexString, PDFString } = lib;
  const [x1, y1] = naarPdf(a.x, a.y + 20, box, rot);
  const [x2, y2] = naarPdf(a.x + 20, a.y, box, rot);
  const ctx = page.doc.context;
  const annot = ctx.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)],
    Contents: PDFHexString.fromText(a.tekst || ''),
    T: PDFHexString.fromText(auteur || 'Bladwerk'),
    Name: 'Comment',
    C: [1, 0.82, 0.25],
    F: 4,
    Open: false,
    M: PDFString.fromDate(new Date()),
  });
  page.node.addAnnot(ctx.register(annot));
}

/* Correcties eerst (die dekken de oude tekst af), dan markeringen, dan de rest. */
export function laagVolgorde(a) {
  return a.type === 'correctie' ? 0 : a.type === 'markeren' ? 1 : 2;
}

async function tekenAantekeningen(page, lijst, kast, lib, box, rot, extra) {
  const plaatjes = extra.plaatjes;
  const gesorteerd = [...lijst].sort((x, y) => laagVolgorde(x) - laagVolgorde(y));
  for (const a of gesorteerd) {
    switch (a.type) {
      case 'tekst':
      case 'datum':
        await tekenTekstblok(page, kast, lib, a, box, rot);
        break;
      case 'markeren':
        rechthoek(page, lib, a, box, rot, {
          color: lib.rgb(...hexNaarRgb(a.kleur || '#ffe14d')),
          opacity: 0.4,
          blendMode: lib.BlendMode.Multiply,
        });
        break;
      case 'correctie': {
        rechthoek(page, lib, a, box, rot, { color: lib.rgb(...hexNaarRgb(a.achtergrond || '#ffffff')) });
        await tekenTekstblok(page, kast, lib, a, box, rot, { basislijn: a.y + (a.basis || a.h * 0.8) });
        break;
      }
      case 'handtekening':
      case 'afbeelding': {
        if (!a.bron) break;
        let img = plaatjes.get(a.bron);
        if (!img) {
          const bytes = dataUrlNaarBytes(a.bron);
          img = a.bron.startsWith('data:image/png')
            ? await page.doc.embedPng(bytes)
            : await page.doc.embedJpg(bytes);
          plaatjes.set(a.bron, img);
        }
        const [x, y] = naarPdf(a.x, a.y + a.h, box, rot);
        page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: lib.degrees(rot) });
        break;
      }
      case 'vinkje': {
        const font = await kast.std('ZapfDingbats');
        const teken = a.teken === 'x' ? '✘' : '✔';
        const grootte = a.h;
        const [x, y] = naarPdf(a.x + a.w * 0.06, a.y + a.h * 0.86, box, rot);
        page.drawText(teken, {
          x, y, size: grootte * 0.95, font,
          color: lib.rgb(...hexNaarRgb(a.kleur || '#1a1a1a')),
          rotate: lib.degrees(rot),
        });
        break;
      }
      case 'stempel': {
        const kleur = lib.rgb(...hexNaarRgb(a.kleur || '#b3261e'));
        rechthoek(page, lib, a, box, rot, { borderColor: kleur, borderWidth: 2, opacity: 0, borderOpacity: 0.9 });
        const font = await kast.voor(a.tekst || '', 'helv', true);
        const regels = [String(a.tekst || '').toUpperCase()];
        if (a.datum) regels.push(a.datum);
        const breedte1 = font.widthOfTextAtSize(regels[0] || ' ', 1);
        const groot = Math.min(a.h * (a.datum ? 0.4 : 0.55), 28, (a.w - 14) / Math.max(breedte1, 0.01));
        const klein = groot * 0.55;
        const hoogte = groot + (a.datum ? klein * 1.25 : 0);
        let basis = a.y + (a.h - hoogte) / 2 + groot * 0.85;
        regels.forEach((regel, i) => {
          const size = i === 0 ? groot : klein;
          const breedte = font.widthOfTextAtSize(regel, size);
          const [x, y] = naarPdf(a.x + (a.w - breedte) / 2, basis, box, rot);
          page.drawText(regel, { x, y, size, font, color: kleur, opacity: 0.9, rotate: lib.degrees(rot) });
          basis += klein * 1.25;
        });
        break;
      }
      case 'opmerking':
        opmerkingToevoegen(page, lib, a, box, rot, extra.auteur);
        break;
      default:
        break;
    }
  }
}

/* Na het vastzetten blijven soms verwijzingen naar verwijderde velden achter; die halen we weg. */
function ruimVerwijzingenOp(lib, pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const item = annots.get(i);
      if (item instanceof lib.PDFRef && !pdfDoc.context.lookup(item)) annots.remove(i);
    }
    if (annots.size() === 0) page.node.delete(lib.PDFName.of('Annots'));
  }
}

function zetVast(lib, pdfDoc) {
  const form = pdfDoc.getForm();
  if (form.getFields().length) form.flatten();
  ruimVerwijzingenOp(lib, pdfDoc);
}

function vulFormulier(lib, pdfDoc, waarden) {
  if (!waarden || !Object.keys(waarden).length) return;
  const form = pdfDoc.getForm();
  for (const [naam, waarde] of Object.entries(waarden)) {
    let veld;
    try { veld = form.getField(naam); } catch (_) { continue; }
    try {
      if (veld instanceof lib.PDFTextField) {
        veld.setText(waarde == null ? '' : String(waarde));
      } else if (veld instanceof lib.PDFCheckBox) {
        if (waarde) veld.check(); else veld.uncheck();
      } else if (veld instanceof lib.PDFRadioGroup) {
        if (waarde) veld.select(String(waarde));
      } else if (veld instanceof lib.PDFDropdown) {
        if (waarde) veld.select(String(waarde));
      } else if (veld instanceof lib.PDFOptionList) {
        if (waarde) veld.select(String(waarde));
      }
    } catch (err) {
      console.warn('Veld kon niet worden ingevuld:', naam, err.message);
    }
  }
}

/*
 * staat = {
 *   bronnen: { [id]: { bytes } },
 *   paginas: [{ id, bron, index, draai }],
 *   aantekeningen: { [paginaId]: [...] },
 *   formulier: { [bronId]: { [veldnaam]: waarde } },
 * }
 * opties = { vastzetten: bool, auteur: string, titel: string }
 */
export async function bouwPdf(lib, staat, opties = {}) {
  const { PDFDocument, degrees } = lib;
  const laadOpties = { updateMetadata: false, ignoreEncryption: false };
  const gebruikteBronnen = [...new Set(staat.paginas.map((p) => p.bron))];
  if (!staat.paginas.length) throw new Error('Er zijn geen pagina\'s om op te slaan.');

  let doc;
  let pages; // PDFPage in de nieuwe volgorde

  if (gebruikteBronnen.length === 1) {
    /* Eén bron: werk in het origineel, zodat invulvelden invulbaar blijven. */
    const bronId = gebruikteBronnen[0];
    doc = await PDFDocument.load(staat.bronnen[bronId].bytes, laadOpties);
    vulFormulier(lib, doc, staat.formulier && staat.formulier[bronId]);
    const form = doc.getForm();
    if (form.hasXFA()) form.deleteXFA();
    if (opties.vastzetten) zetVast(lib, doc);
    const alle = doc.getPages();
    pages = staat.paginas.map((p) => alle[p.index]);
    for (let i = alle.length - 1; i >= 0; i--) doc.removePage(i);
    pages.forEach((pg, i) => doc.insertPage(i, pg));
  } else {
    /* Meerdere bronnen: samenvoegen; ingevulde formulieren worden vastgezet. */
    doc = await PDFDocument.create();
    const geladen = {};
    for (const id of gebruikteBronnen) {
      const bronDoc = await PDFDocument.load(staat.bronnen[id].bytes, laadOpties);
      const form = bronDoc.getForm();
      vulFormulier(lib, bronDoc, staat.formulier && staat.formulier[id]);
      if (form.hasXFA()) form.deleteXFA();
      zetVast(lib, bronDoc);
      geladen[id] = bronDoc;
    }
    pages = [];
    for (const p of staat.paginas) {
      const [kopie] = await doc.copyPages(geladen[p.bron], [p.index]);
      doc.addPage(kopie);
      pages.push(kopie);
    }
  }

  if (opties.fontkit) doc.registerFontkit(opties.fontkit);
  const kast = new Letterkast(lib, doc, opties.fontkit ? opties.laadUnicodeLetter : null);
  const extra = { plaatjes: new Map(), auteur: opties.auteur };

  for (let i = 0; i < staat.paginas.length; i++) {
    const p = staat.paginas[i];
    const page = pages[i];
    const oorspronkelijk = ((page.getRotation().angle % 360) + 360) % 360;
    const rot = (oorspronkelijk + (p.draai || 0)) % 360;
    if (rot !== oorspronkelijk) page.setRotation(degrees(rot));
    const lijst = (staat.aantekeningen && staat.aantekeningen[p.id]) || [];
    if (!lijst.length) continue;
    const cb = page.getCropBox();
    const box = { x0: cb.x, y0: cb.y, w: cb.width, h: cb.height };
    await tekenAantekeningen(page, lijst, kast, lib, box, rot, extra);
  }

  if (opties.titel) doc.setTitle(opties.titel);
  doc.setProducer('Bladwerk (Hartspraak)');
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

/* Maakt een PDF van foto's: elke foto op een A4-pagina, of pagina zo groot als de foto. */
export async function fotosNaarPdf(lib, fotos, opties = {}) {
  const { PDFDocument } = lib;
  const doc = await PDFDocument.create();
  const A4 = [595.28, 841.89];
  const marge = opties.marge != null ? opties.marge : 28;
  for (const f of fotos) {
    const img = f.type === 'png' ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes);
    if (opties.paginaFormaat === 'foto') {
      const w = img.width * 72 / 150;
      const h = img.height * 72 / 150;
      const page = doc.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    } else {
      const liggend = img.width > img.height;
      const [pw, ph] = liggend ? [A4[1], A4[0]] : A4;
      const page = doc.addPage([pw, ph]);
      const schaal = Math.min((pw - 2 * marge) / img.width, (ph - 2 * marge) / img.height);
      const w = img.width * schaal;
      const h = img.height * schaal;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  doc.setProducer('Bladwerk (Hartspraak)');
  return doc.save();
}

/* Splitst een PDF in delen. delen = [[0,1,2],[3,4],...] (paginanummers vanaf 0). */
export async function splitsPdf(lib, bytes, delen) {
  const { PDFDocument } = lib;
  const bron = await PDFDocument.load(bytes);
  const uit = [];
  for (const deel of delen) {
    const doc = await PDFDocument.create();
    const kopieen = await doc.copyPages(bron, deel);
    kopieen.forEach((k) => doc.addPage(k));
    doc.setProducer('Bladwerk (Hartspraak)');
    uit.push(await doc.save());
  }
  return uit;
}

/*
 * Leest "1-3, 5, 8-10" en geeft groepen paginanummers (vanaf 0) terug.
 * Elk stuk tussen komma's wordt een apart bestand.
 */
export function leesBereiken(tekst, aantal) {
  const groepen = [];
  for (const stuk of String(tekst).split(/[,;]/)) {
    const s = stuk.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*(?:-|–|t\/m|tot)\s*(\d+|eind|einde)$/i);
    let van;
    let tot;
    if (m) {
      van = parseInt(m[1], 10);
      tot = /eind/i.test(m[2]) ? aantal : parseInt(m[2], 10);
    } else if (/^\d+$/.test(s)) {
      van = tot = parseInt(s, 10);
    } else {
      throw new Error(`"${s}" begrijp ik niet. Gebruik bijvoorbeeld 1-3, 5, 8-10.`);
    }
    if (van < 1 || tot > aantal || van > tot) {
      throw new Error(`"${s}" valt buiten het document (1 t/m ${aantal}).`);
    }
    const g = [];
    for (let i = van; i <= tot; i++) g.push(i - 1);
    groepen.push(g);
  }
  if (!groepen.length) throw new Error('Vul aan welke pagina\'s je wilt hebben.');
  return groepen;
}
