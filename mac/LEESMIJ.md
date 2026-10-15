# Bladwerk als losse Mac-app

Dezelfde werkruimte als pdf.hartspraak.com, maar helemaal op de eigen Mac:
geen server, geen inlog, geen internet. Omzetten, verkleinen en tekstherkenning
zitten er niet in; de app wijst naar de Mac-eigen manier (Word/Pages, Voorvertoning).

## Bouwen (kan op Linux)

```
cd mac
npm install
npm run mac            # maakt uit/mac-arm64/Bladwerk.app en uit/mac/Bladwerk.app
```

Daarna ad-hoc ondertekenen (nodig voor Apple Silicon) met `rcodesign sign Bladwerk.app`
en inpakken met `zip -qry` (symlinks bewaren).

## Testen

`node test-app.js` (Linux-Electron onder Xvfb, `DISPLAY=:99`).
