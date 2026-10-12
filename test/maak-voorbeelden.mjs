import * as lib from 'pdf-lib';
import fs from 'fs';
const { PDFDocument, StandardFonts, rgb, degrees } = lib;
fs.mkdirSync('test/voorbeelden', { recursive: true });

// 1. Gewone brief, 3 pagina's, waarvan pagina 2 /Rotate 90
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.TimesRoman);
  for (let i = 1; i <= 3; i++) {
    const p = d.addPage([595.28, 841.89]);
    p.drawText(`Pagina ${i} van de brief`, { x: 72, y: 760, size: 18, font: f });
    p.drawText('Datum: 1 oktober 2026, met een tikfout: Dortmnd', { x: 72, y: 720, size: 12, font: f });
    p.drawRectangle({ x: 72, y: 100, width: 451, height: 2, color: rgb(0.2, 0.5, 0.5) });
    if (i === 2) p.setRotation(degrees(90));
  }
  fs.writeFileSync('test/voorbeelden/brief.pdf', await d.save());
}
// 2. Formulier met invulvakjes
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([595.28, 841.89]);
  p.drawText('Aanmeldformulier', { x: 72, y: 780, size: 20, font: f });
  p.drawText('Naam:', { x: 72, y: 720, size: 12, font: f });
  p.drawText('Akkoord:', { x: 72, y: 680, size: 12, font: f });
  p.drawText('Groep:', { x: 72, y: 640, size: 12, font: f });
  const form = d.getForm();
  const naam = form.createTextField('naam'); naam.addToPage(p, { x: 150, y: 712, width: 250, height: 22 });
  const ok = form.createCheckBox('akkoord'); ok.addToPage(p, { x: 150, y: 674, width: 16, height: 16 });
  const g = form.createDropdown('groep'); g.addOptions(['Eerste jaar', 'Tweede jaar']); g.addToPage(p, { x: 150, y: 632, width: 160, height: 22 });
  fs.writeFileSync('test/voorbeelden/formulier.pdf', await d.save());
}
// 3. Liggende pagina
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([841.89, 595.28]);
  p.drawText('Liggende pagina (ander document)', { x: 72, y: 500, size: 20, font: f });
  fs.writeFileSync('test/voorbeelden/liggend.pdf', await d.save());
}
console.log('klaar');
