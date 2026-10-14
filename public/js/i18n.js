/*
 * Talen van Bladwerk: Nederlands (bron), Engels en Duits.
 * De Nederlandse tekst is zelf de sleutel: t('Opslaan') geeft in het
 * Engels 'Save'. Variabelen staan tussen accolades: t('Pagina {i} van {n}', { i, n }).
 * Werkt ook in Node (voor de tests); daar is de taal altijd Nederlands.
 */
import { VERTALINGEN } from './vertalingen.js';

export const TALEN = { nl: 'Nederlands', en: 'English', de: 'Deutsch' };
const LOCALES = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE' };
const SLEUTEL = 'bladwerk.taal';

function bepaalTaal() {
  if (typeof window === 'undefined') return 'nl';
  try {
    const gekozen = window.localStorage.getItem(SLEUTEL);
    if (gekozen && TALEN[gekozen]) return gekozen;
  } catch (_) { /* geen opslag */ }
  const voorkeuren = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  for (const v of voorkeuren) {
    const code = String(v).slice(0, 2).toLowerCase();
    if (TALEN[code]) return code;
  }
  return 'en';
}

let huidig = bepaalTaal();
if (typeof document !== 'undefined') document.documentElement.lang = huidig;

export const taal = () => huidig;
export const locale = () => LOCALES[huidig];

/* Kiest een taal, onthoudt die en laadt de app opnieuw in die taal. */
export function zetTaal(code) {
  if (!TALEN[code]) return;
  try { window.localStorage.setItem(SLEUTEL, code); } catch (_) { /* geen opslag */ }
  huidig = code;
  window.location.reload();
}

export function t(tekst, vars) {
  let uit = tekst;
  if (huidig !== 'nl') {
    const woordenboek = VERTALINGEN[huidig];
    if (woordenboek && Object.prototype.hasOwnProperty.call(woordenboek, tekst)) uit = woordenboek[tekst];
    else if (typeof console !== 'undefined') console.warn(`[vertaling ontbreekt: ${huidig}]`, tekst);
  }
  if (vars) uit = uit.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  return uit;
}
