import * as lib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import { bouwPdf, splitsPdf, leesBereiken, fotosNaarPdf } from '../public/js/bouwen.js';
const lees = (n) => new Uint8Array(fs.readFileSync('test/voorbeelden/' + n));
const sig = 'data:image/png;base64,' + fs.readFileSync('test/voorbeelden/handtekening.png').toString('base64');
const laadUnicodeLetter = async () => fs.readFileSync('public/fonts/DejaVuSans.ttf');
fs.mkdirSync('test/uitvoer', { recursive: true });

const annots = (label) => [
  { id: 'a', type: 'tekst', x: 72, y: 72, w: 300, h: 40, tekst: `${label}: Tekst ëüß €\nTweede regel`, grootte: 14, letter: 'helv', kleur: '#1d4ed8' },
  { id: 'b', type: 'markeren', x: 60, y: 140, w: 200, h: 20 },
  { id: 'c', type: 'handtekening', x: 300, y: 200, w: 160, h: 48, bron: sig },
  { id: 'd', type: 'vinkje', x: 72, y: 260, w: 18, h: 18, teken: 'v' },
  { id: 'e', type: 'vinkje', x: 100, y: 260, w: 18, h: 18, teken: 'x' },
  { id: 'f', type: 'stempel', x: 300, y: 300, w: 170, h: 56, tekst: 'Goedgekeurd', datum: '12-10-2026' },
  { id: 'g', type: 'opmerking', x: 520, y: 80, w: 20, h: 20, tekst: 'Even nakijken' },
  { id: 'h', type: 'tekst', x: 72, y: 360, w: 300, h: 20, tekst: 'Lettertest Ωμέγα ✓ (unicode)', grootte: 12, letter: 'times' },
];

// 1. Eén bron, volgorde om, pagina 1 gedraaid, aantekeningen op elke pagina
const staat1 = {
  bronnen: { b1: { bytes: lees('brief.pdf') } },
  paginas: [
    { id: 'p3', bron: 'b1', index: 2, draai: 0 },
    { id: 'p1', bron: 'b1', index: 0, draai: 90 },
    { id: 'p2', bron: 'b1', index: 1, draai: 0 }, // heeft al /Rotate 90
  ],
  aantekeningen: { p3: annots('P3'), p1: annots('P1 gedraaid'), p2: annots('P2 al gedraaid') },
};
fs.writeFileSync('test/uitvoer/1-een-bron.pdf', await bouwPdf(lib, staat1, { laadUnicodeLetter, fontkit, auteur: 'Martien' }));

// 2. Formulier invullen, invulbaar laten
const staat2 = {
  bronnen: { f: { bytes: lees('formulier.pdf') } },
  paginas: [{ id: 'q1', bron: 'f', index: 0, draai: 0 }],
  formulier: { f: { naam: 'Martinus Janssen', akkoord: true, groep: 'Tweede jaar' } },
  aantekeningen: {},
};
const uit2 = await bouwPdf(lib, staat2, {});
fs.writeFileSync('test/uitvoer/2-formulier.pdf', uit2);
const chk = await lib.PDFDocument.load(uit2);
const fm = chk.getForm();
console.log('formulier velden:', fm.getFields().length, fm.getTextField('naam').getText(), fm.getCheckBox('akkoord').isChecked(), fm.getDropdown('groep').getSelected());

// 3. Samenvoegen van drie bronnen, formulier wordt vastgezet
const staat3 = {
  bronnen: { b1: { bytes: lees('brief.pdf') }, f: { bytes: lees('formulier.pdf') }, l: { bytes: lees('liggend.pdf') } },
  paginas: [
    { id: 'x1', bron: 'f', index: 0, draai: 0 },
    { id: 'x2', bron: 'l', index: 0, draai: 270 },
    { id: 'x3', bron: 'b1', index: 1, draai: 90 },
  ],
  formulier: { f: { naam: 'Samengevoegd ingevuld', akkoord: true } },
  aantekeningen: { x2: annots('Liggend 270'), x3: annots('Brief p2 totaal 180') },
};
const uit3 = await bouwPdf(lib, staat3, { laadUnicodeLetter, fontkit });
fs.writeFileSync('test/uitvoer/3-samengevoegd.pdf', uit3);
const d3 = await lib.PDFDocument.load(uit3);
console.log('samengevoegd:', d3.getPageCount(), 'paginas, rotaties', d3.getPages().map((p) => p.getRotation().angle), 'velden', d3.getForm().getFields().length);

// 4. Splitsen
const groepen = leesBereiken('1-2, 3', 3);
const delen = await splitsPdf(lib, lees('brief.pdf'), groepen);
console.log('splitsen:', groepen, delen.map((d) => d.length));
try { leesBereiken('2-9', 3); } catch (e) { console.log('fout verwacht:', e.message); }

// 5. Foto naar PDF
const png = fs.readFileSync('test/voorbeelden/handtekening.png');
fs.writeFileSync('test/uitvoer/5-foto.pdf', await fotosNaarPdf(lib, [{ type: 'png', bytes: png }]));
console.log('alles gebouwd');
