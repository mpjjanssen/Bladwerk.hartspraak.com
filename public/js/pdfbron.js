/* Laden van PDF's en foto's: bibliotheken, ontgrendelen, foto's omzetten. */
import { t } from './i18n.js';
import { LOKAAL } from './omgeving.js';
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
import * as PDFLib from '/vendor/pdf-lib/pdf-lib.esm.min.js';
import { api, vraagWachtwoord, leesAlsBytes } from './hulp.js';
import { fotosNaarPdf } from './bouwen.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

/* fontkit wordt als gewoon script geladen (zie index.html). */
const fontkit = window.fontkit;

export { pdfjsLib, PDFLib, fontkit };

let unicodeLetter = null;
export async function laadUnicodeLetter() {
  if (!unicodeLetter) {
    const res = await fetch('/fonts/DejaVuSans.ttf');
    unicodeLetter = new Uint8Array(await res.arrayBuffer());
  }
  return unicodeLetter;
}

export const BOUW_OPTIES = {
  fontkit,
  laadUnicodeLetter,
  /* Naam bij opmerkingen in de PDF: wie er is ingelogd. */
  get auteur() { return (typeof window !== 'undefined' && window.bladwerkGebruiker) || 'Bladwerk'; },
};

export function openPdfjs(bytes) {
  return pdfjsLib.getDocument({
    data: bytes.slice(),
    cMapUrl: '/vendor/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    isEvalSupported: false,
    enableXfa: false,
  }).promise;
}

function isPdf(bytes) {
  const kop = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return kop.includes('%PDF-');
}

/*
 * Controleert of pdf-lib het bestand kan bewerken. Is het beveiligd,
 * dan proberen we het via de eigen server te ontgrendelen (eerst zonder
 * wachtwoord, want vaak zijn alleen bewerkingen geblokkeerd).
 * Geeft { bytes, xfa, velden } terug, of null als je annuleert.
 */
export async function maakBewerkbaar(bytes, naam) {
  if (!isPdf(bytes)) throw new Error(t('"{naam}" is geen PDF-bestand.', { naam }));
  let doc;
  try {
    doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    const versleuteld = err && (err.name === 'EncryptedPDFError' || /encrypt/i.test(err.message || ''));
    if (!versleuteld) {
      throw new Error(t('"{naam}" kan ik niet lezen. Het bestand is mogelijk beschadigd.', { naam }));
    }
    if (LOKAAL) {
      throw new Error(t('"{naam}" is beveiligd met een wachtwoord. Open hem in Voorvertoning, kies Archief → Exporteer… en zet "Codeer" uit. Open daarna die nieuwe versie in Bladwerk.', { naam }));
    }
    bytes = await ontgrendel(bytes, naam);
    if (!bytes) return null;
    doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  }
  let xfa = false;
  let velden = 0;
  try {
    const form = doc.getForm();
    xfa = form.hasXFA();
    velden = form.getFields().length;
  } catch (_) { /* geen formulier */ }
  return { bytes, xfa, velden, aantal: doc.getPageCount() };
}

async function ontgrendel(bytes, naam) {
  let wachtwoord = '';
  let fout = null;
  for (;;) {
    try {
      const { blob } = await api('/api/ontgrendelen', new Blob([bytes], { type: 'application/pdf' }), 'beveiligd.pdf', { wachtwoord });
      return new Uint8Array(await blob.arrayBuffer());
    } catch (err) {
      if (err.status !== 422) throw err;
      if (err.message !== 'WACHTWOORD_NODIG') fout = err.message;
    }
    wachtwoord = await vraagWachtwoord(naam, fout);
    if (wachtwoord == null) return null;
    if (!wachtwoord) fout = t('Vul een wachtwoord in.');
  }
}

/*
 * Leest een foto en geeft JPG- of PNG-bytes terug, rechtop gedraaid.
 * iPhone-foto's (HEIC) worden eerst op de eigen server omgezet.
 */
export async function leesFoto(bestand) {
  let blob = bestand;
  const naam = (bestand.name || '').toLowerCase();
  if (/\.(heic|heif)$/.test(naam) || /image\/hei[cf]/.test(bestand.type)) {
    if (LOKAAL) {
      // De Mac zet iPhone-foto's zelf om (met het ingebouwde programma sips).
      const jpg = await window.bladwerkLokaal.heicNaarJpg(new Uint8Array(await bestand.arrayBuffer()));
      if (!jpg) throw new Error(t('"{naam}" is een iPhone-foto die niet kon worden omgezet. Open hem in Voorvertoning, kies Archief → Exporteer… met formaat JPEG, en gebruik die versie.', { naam: bestand.name }));
      blob = new Blob([jpg], { type: 'image/jpeg' });
    } else {
      ({ blob } = await api('/api/foto-naar-jpg', bestand, bestand.name));
    }
  }
  let beeld;
  try {
    beeld = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (_) {
    throw new Error(t('"{naam}" kan ik niet als foto lezen.', { naam: bestand.name }));
  }
  const maxZijde = 4000;
  const schaal = Math.min(1, maxZijde / Math.max(beeld.width, beeld.height));
  const c = document.createElement('canvas');
  c.width = Math.round(beeld.width * schaal);
  c.height = Math.round(beeld.height * schaal);
  const ctx = c.getContext('2d');
  const png = /\.png$/.test(naam) || blob.type === 'image/png';
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(beeld, 0, 0, c.width, c.height);
  beeld.close && beeld.close();
  const uit = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.9));
  return { type: png ? 'png' : 'jpg', bytes: await leesAlsBytes(uit), breedte: c.width, hoogte: c.height };
}

export async function fotosAlsPdf(bestanden, opties) {
  const fotos = [];
  for (const b of bestanden) fotos.push(await leesFoto(b));
  return fotosNaarPdf(PDFLib, fotos, opties);
}

export function isFoto(bestand) {
  return /^image\//.test(bestand.type) || /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i.test(bestand.name || '');
}
