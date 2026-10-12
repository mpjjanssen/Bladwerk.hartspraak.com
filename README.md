# Bladwerk

Eigen PDF-hulpmiddel van Hartspraak, op pdf.hartspraak.com.

## Wat het doet

In de browser (bestanden blijven op je eigen computer):
- pagina's samenvoegen, splitsen, draaien, verwijderen, ordenen en uitnemen
- formulieren invullen (invulvakjes en platte formulieren)
- ondertekenen met je eigen handtekening (alleen in je browser bewaard)
- tekst, vinkjes, datum, markeringen, opmerkingen en stempels
- kleine tekstcorrecties (afdekken en nieuwe tekst erop)
- foto's naar PDF en pagina's als afbeelding
- tussentijds bewaren: na een crash ga je verder waar je was

Op de eigen server (bestand wordt direct na verwerking gewist):
- Word naar PDF (LibreOffice) en PDF naar Word (pdf2docx)
- verkleinen in drie standen (Ghostscript)
- scans doorzoekbaar maken in het Nederlands, Duits en Engels (ocrmypdf)
- beveiligde PDF's ontgrendelen met je eigen wachtwoord (qpdf)
- iPhone-foto's (HEIC) omzetten

## Instellingen op Railway

| Variabele | Betekenis |
|---|---|
| `BLADWERK_PASSWORD` | het wachtwoord om in te loggen |
| `SESSION_SECRET` | lange willekeurige tekst; wijzigen logt iedereen uit |

Railway bouwt met de `Dockerfile`. Gezondheidscontrole: `/gezond`.

## Lokaal draaien

```
npm install
BLADWERK_PASSWORD=test SESSION_SECRET=iets-langs node server.js
```

Tests: `node test/maak-voorbeelden.mjs && node test/test-bouwen.mjs`.
