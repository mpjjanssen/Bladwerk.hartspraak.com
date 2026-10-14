/*
 * Inloggen binnen de app. Het inlogscherm legt zich over de pagina heen,
 * zodat een bestand dat je via "Open met → Bladwerk" opende niet kwijtraakt.
 * Gebruikt alleen de vertalingen, zodat elk ander onderdeel dit kan gebruiken.
 */
import { t, taal } from './i18n.js';
let bezigeInlog = null;

function maak(tag, attrs = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kinderen) if (k != null) e.append(k);
  return e;
}

/* Geeft 'ja', 'nee' of 'offline'. */
export async function controleerSessie() {
  try {
    const res = await fetch('/api/sessie', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Taal': taal() } });
    if (res.ok) {
      try { window.bladwerkGebruiker = (await res.json()).naam || null; } catch (_) { /* niets */ }
      return 'ja';
    }
    if (res.status === 401) return 'nee';
    return 'offline';
  } catch (_) {
    return 'offline';
  }
}

/* Toont het inlogscherm en wacht tot het inloggen gelukt is. */
export function toonInlog() {
  if (bezigeInlog) return bezigeInlog;
  bezigeInlog = new Promise((resolve) => {
    const veld = maak('input', { class: 'veld', type: 'password', id: 'bw-wachtwoord', name: 'wachtwoord', autocomplete: 'current-password', required: true });
    const fout = maak('p', { class: 'fouttekst', hidden: true });
    const knop = maak('button', { class: 'knop knop-primair knop-breed', type: 'submit' }, t('Inloggen'));
    const merk = maak('div', { class: 'merk merk-groot' }, maak('img', { src: '/img/logo.svg', alt: '' }), maak('span', {}, 'Bladwerk'));
    const formulier = maak('form', { class: 'login-formulier' },
      maak('label', { class: 'label', for: 'bw-wachtwoord' }, t('Wachtwoord')), veld, fout, knop);
    const wacht = maak('p', { class: 'klein login-wacht', hidden: true });
    const kaart = maak('main', { class: 'login-kaart', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Inloggen') },
      merk, maak('p', { class: 'login-uitleg' }, t('Het PDF-hulpmiddel van Hartspraak.')), wacht, formulier);
    const laag = maak('div', { class: 'login-laag' }, kaart);
    document.body.append(laag);
    setTimeout(() => veld.focus(), 30);

    formulier.addEventListener('submit', async (e) => {
      e.preventDefault();
      knop.disabled = true;
      fout.hidden = true;
      try {
        const res = await fetch('/inloggen', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Taal': taal() },
          body: new URLSearchParams({ wachtwoord: veld.value }),
        });
        if (res.ok) {
          await controleerSessie();
          laag.remove();
          bezigeInlog = null;
          resolve();
          return;
        }
        let tekst = t('Inloggen lukte niet.');
        try { tekst = (await res.json()).fout || tekst; } catch (_) { /* geen json */ }
        fout.textContent = tekst;
        fout.hidden = false;
        veld.select();
      } catch (_) {
        fout.textContent = t('De server is niet bereikbaar. Controleer je internetverbinding.');
        fout.hidden = false;
      } finally {
        knop.disabled = false;
      }
    });

    /* Een bestand dat op inloggen wacht, laten we zien. */
    toonInlog.melding = (tekst) => { wacht.textContent = tekst; wacht.hidden = !tekst; };
  });
  return bezigeInlog;
}

/* Zorgt dat je ingelogd bent; offline mag je gewoon verder (zonder serverklussen). */
export async function zorgVoorSessie() {
  const stand = await controleerSessie();
  if (stand === 'nee') await toonInlog();
  return stand;
}
