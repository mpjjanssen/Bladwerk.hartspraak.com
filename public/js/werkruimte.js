/*
 * De werkruimte: één document waarin je pagina's beheert, invult,
 * ondertekent en aantekeningen maakt. Alles gebeurt in de browser;
 * pas bij opslaan wordt er een nieuwe PDF gebouwd.
 */
import { pdfjsLib, PDFLib, openPdfjs, maakBewerkbaar, BOUW_OPTIES, fotosAlsPdf, isFoto } from './pdfbron.js';
import { bouwPdf, LETTERS, REGELHOOGTE, schermMaat, laagVolgorde } from './bouwen.js';
import {
  el, icoon, knop, melding, bezig, dialoog, bevestig, api, grootte, basisNaam, vandaag,
  kiesBestanden, bewaar, overschrijf, bewaarMeerdere, leesAlsBytes,
} from './hulp.js';
import { haalHandtekening, stelHandtekeningIn } from './handtekening.js';
import * as concept from './concept.js';

let teller = 0;
const nieuwId = (p) => `${p}${Date.now().toString(36)}${(teller++).toString(36)}`;
const PX_PER_PT = 96 / 72;

const STEMPELS = ['Goedgekeurd', 'Ontvangen', 'Gezien', 'Afgehandeld', 'Betaald', 'Vertrouwelijk', 'Concept', 'Kopie'];
const TEKSTKLEUREN = [['#000000', 'Zwart'], ['#1d3f8f', 'Blauw'], ['#b3261e', 'Rood'], ['#2a7d7d', 'Teal']];
const MARKEERKLEUREN = [['#ffe14d', 'Geel'], ['#9be38a', 'Groen'], ['#ff9ec7', 'Roze'], ['#8fd3ff', 'Blauw']];
const STEMPELKLEUREN = [['#b3261e', 'Rood'], ['#1d3f8f', 'Blauw'], ['#2f7d32', 'Groen']];

const HINTS = {
  kiezen: '',
  tekst: 'Klik op de pagina waar de tekst moet komen. Esc om te stoppen.',
  handtekening: 'Klik op de plek waar je handtekening moet komen.',
  vinkje: 'Klik waar het vinkje moet komen. Esc om te stoppen.',
  kruisje: 'Klik waar het kruisje moet komen. Esc om te stoppen.',
  datum: 'Klik waar de datum van vandaag moet komen.',
  markeren: 'Trek met de muis een vak over de tekst die je wilt markeren.',
  opmerking: 'Klik waar de opmerking moet komen.',
  stempel: 'Kies rechts een stempel en klik op de pagina.',
  corrigeren: 'Wijs een woord of regel aan en klik erop om hem te verbeteren.',
};

export class Werkruimte {
  constructor(root, { opSluiten }) {
    this.root = root;
    this.opSluiten = opSluiten;
    this.bronnen = new Map();
    this.plaatjes = new Map();
    this.staat = { paginas: [], aantekeningen: {}, formulier: {} };
    this.historie = [];
    this.toekomst = [];
    this.zoom = 1.3;
    this.gereedschap = 'kiezen';
    this.gekozen = null; // { pid, aid }
    this.bewerkt = null; // { pid, aid }
    this.paginaKeuze = new Set();
    this.laatsteKlik = null;
    this.paginaEls = new Map();
    this.naam = 'document';
    this.gewijzigd = false;
    this.tekstStijl = { letter: 'helv', grootte: 11, kleur: '#000000', vet: false };
    this.stempel = { tekst: 'Goedgekeurd', datum: true, kleur: '#b3261e' };
    this.markeerKleur = '#ffe14d';
    this.tekstCache = new Map();
    this.veldCache = new Map();
    this._toetsen = (e) => this.toets(e);
    this._voorVertrek = (e) => { if (this.gewijzigd) { e.preventDefault(); e.returnValue = ''; } };
    this.bouwOpzet();
  }

  /* ================= Opzet van het scherm ================= */
  bouwOpzet() {
    this.root.innerHTML = '';
    this.knopTerug = knop('', { icoon: 'terug', titel: 'Ongedaan maken (⌘Z)', klik: () => this.ongedaan(), class: 'knop-icoon' });
    this.knopVooruit = knop('', { icoon: 'vooruit', titel: 'Opnieuw (⇧⌘Z)', klik: () => this.opnieuw(), class: 'knop-icoon' });
    this.zoomLabel = el('span', { class: 'zoom-label' }, '100%');
    this.docNaamEl = el('div', { class: 'docnaam' });
    this.paginaTeller = el('div', { class: 'paginateller' });

    const balk = el('header', { class: 'balk' },
      el('div', { class: 'merk', title: 'Bladwerk' }, el('img', { src: '/img/logo.svg', alt: '' }), el('span', {}, 'Bladwerk')),
      this.docNaamEl,
      el('div', { class: 'balk-groep' }, this.knopTerug, this.knopVooruit),
      el('div', { class: 'balk-groep zoom' },
        knop('', { icoon: 'min', titel: 'Kleiner', klik: () => this.zoomen(1 / 1.15), class: 'knop-icoon' }),
        this.zoomLabel,
        knop('', { icoon: 'plus', titel: 'Groter', klik: () => this.zoomen(1.15), class: 'knop-icoon' }),
        knop('Paginabreedte', { klik: () => this.passend(), class: 'knop-klein' })),
      this.paginaTeller,
      el('div', { class: 'balk-rechts' },
        knop('Opslaan', { icoon: 'opslaan', soort: 'primair', klik: () => this.opslaan() }),
        knop('Sluiten', { icoon: 'sluiten', klik: () => this.sluiten() })));

    this.miniLijst = el('div', { class: 'mini-lijst', tabindex: '-1' });
    const links = el('aside', { class: 'zijbalk-links', 'aria-label': 'Pagina\'s' },
      el('div', { class: 'zijbalk-kop' }, 'Pagina\'s'),
      this.miniLijst,
      el('div', { class: 'mini-voet' },
        knop('Pagina\'s toevoegen', { icoon: 'toevoegen', klik: () => this.paginasToevoegen(), class: 'knop-klein knop-breed' })));

    this.paginasEl = el('div', { class: 'paginas' });
    this.hintEl = el('div', { class: 'hint', hidden: true });
    this.vlak = el('section', { class: 'paginavlak' }, this.paginasEl);
    const midden = el('div', { class: 'midden' }, this.vlak, this.hintEl);

    this.gereedschapEl = el('div', { class: 'gereedschap' });
    this.eigenschapEl = el('div', { class: 'eigenschappen', hidden: true });
    const rechts = el('aside', { class: 'zijbalk-rechts', 'aria-label': 'Gereedschap' },
      this.gereedschapEl, this.eigenschapEl, this.paginaGereedschap());

    this.root.append(balk, el('div', { class: 'werk' }, links, midden, rechts));
    this.bouwGereedschap();
    this.koppelSlepen();

    let scrollTimer;
    this.vlak.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => this.werkHuidigeBij(), 80);
    }, { passive: true });
    this.vlak.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.zoomen(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });
  }

  gereedschapKnop(id, label, ic) {
    const b = knop(label, { icoon: ic, klik: () => this.kiesGereedschap(id), class: 'gereedschap-knop' });
    b.dataset.gereedschap = id;
    return b;
  }

  bouwGereedschap() {
    const h = haalHandtekening();
    const handtekeningKnop = this.gereedschapKnop('handtekening', h ? 'Handtekening' : 'Handtekening (instellen)', 'handtekening');
    if (h) handtekeningKnop.append(el('img', { class: 'mini-handtekening', src: h.bron, alt: '' }));
    this.gereedschapEl.innerHTML = '';
    this.gereedschapEl.append(
      el('div', { class: 'groep' },
        this.gereedschapKnop('kiezen', 'Selecteren', 'kiezen')),
      el('div', { class: 'groep' },
        el('h3', {}, 'Ondertekenen en invullen'),
        handtekeningKnop,
        this.gereedschapKnop('tekst', 'Tekst', 'tekst'),
        el('div', { class: 'rij' },
          this.gereedschapKnop('vinkje', 'Vinkje', 'vinkje'),
          this.gereedschapKnop('kruisje', 'Kruisje', 'kruisje')),
        this.gereedschapKnop('datum', 'Datum van vandaag', 'datum'),
        el('button', { type: 'button', class: 'linkknop', onclick: async () => { await stelHandtekeningIn(); this.bouwGereedschap(); } }, 'Handtekening instellen')),
      el('div', { class: 'groep' },
        el('h3', {}, 'Aantekeningen'),
        this.gereedschapKnop('markeren', 'Markeren', 'markeren'),
        this.gereedschapKnop('opmerking', 'Opmerking', 'opmerking'),
        this.gereedschapKnop('stempel', 'Stempel', 'stempel')),
      el('div', { class: 'groep' },
        el('h3', {}, 'Corrigeren'),
        this.gereedschapKnop('corrigeren', 'Tekst corrigeren', 'corrigeren')),
      this.stempelPaneel = el('div', { class: 'groep stempelkeuze', hidden: true }));
    this.werkGereedschapBij();
  }

  paginaGereedschap() {
    return el('div', { class: 'groep paginagroep' },
      el('h3', {}, 'Pagina\'s'),
      el('div', { class: 'rij' },
        knop('Linksom', { icoon: 'links', klik: () => this.draaiPaginas(-90), titel: 'Draai de gekozen pagina\'s linksom' }),
        knop('Rechtsom', { icoon: 'rechts', klik: () => this.draaiPaginas(90), titel: 'Draai de gekozen pagina\'s rechtsom' })),
      knop('Verwijderen', { icoon: 'weg', klik: () => this.verwijderPaginas() }),
      knop('Uitnemen als nieuwe PDF', { icoon: 'uitnemen', klik: () => this.uitnemen() }),
      el('h3', {}, 'Meer'),
      knop('Doorzoekbaar maken', { icoon: 'zoeken', klik: () => this.doorzoekbaarMaken(), titel: 'Tekst in gescande pagina\'s herkennen' }),
      knop('Opslaan als Word', { icoon: 'word', klik: () => this.alsWord() }),
      knop('Pagina\'s als afbeelding', { icoon: 'afbeeldingen', klik: () => this.alsAfbeeldingen() }),
      el('p', { class: 'klein uitleg' }, 'Tip: kies pagina\'s links met ⌘-klik of ⇧-klik om er meerdere tegelijk te draaien, verwijderen of uit te nemen.'));
  }

  werkGereedschapBij() {
    for (const b of this.root.querySelectorAll('.gereedschap-knop')) {
      b.classList.toggle('actief', b.dataset.gereedschap === this.gereedschap);
    }
    const hint = HINTS[this.gereedschap];
    this.hintEl.hidden = !hint;
    this.hintEl.textContent = hint || '';
    this.root.dataset.gereedschap = this.gereedschap;
    this.stempelPaneel.hidden = this.gereedschap !== 'stempel';
    if (this.gereedschap === 'stempel') this.bouwStempelPaneel();
  }

  bouwStempelPaneel() {
    const keuze = el('select', { class: 'veld' }, STEMPELS.map((s) => el('option', { value: s, selected: s === this.stempel.tekst || null }, s)));
    keuze.addEventListener('change', () => { this.stempel.tekst = keuze.value; });
    const datum = el('input', { type: 'checkbox', checked: this.stempel.datum || null });
    datum.addEventListener('change', () => { this.stempel.datum = datum.checked; });
    this.stempelPaneel.innerHTML = '';
    this.stempelPaneel.append(
      el('h3', {}, 'Welke stempel'),
      keuze,
      el('label', { class: 'vinklabel' }, datum, 'Met datum van vandaag'),
      this.kleurKeuze(STEMPELKLEUREN, this.stempel.kleur, (k) => { this.stempel.kleur = k; }));
  }

  async kiesGereedschap(id) {
    this.stopBewerken();
    if (id === 'handtekening' && !haalHandtekening()) {
      const h = await stelHandtekeningIn();
      this.bouwGereedschap();
      if (!h) return;
    }
    this.gereedschap = this.gereedschap === id && id !== 'kiezen' ? 'kiezen' : id;
    if (this.gereedschap !== 'kiezen') this.kies(null);
    this.werkGereedschapBij();
  }

  /* ================= Documenten laden ================= */
  async voegBronToe(bytes, naam, handle) {
    const pdf = await openPdfjs(bytes);
    const info = new Array(pdf.numPages);
    for (let start = 0; start < pdf.numPages; start += 25) {
      const klus = [];
      for (let i = start; i < Math.min(pdf.numPages, start + 25); i++) {
        klus.push(pdf.getPage(i + 1).then((pg) => {
          const [x0, y0, x1, y1] = pg.view;
          info[i] = { box: { x0, y0, w: x1 - x0, h: y1 - y0 }, rot: ((pg.rotate % 360) + 360) % 360 };
        }));
      }
      await Promise.all(klus);
    }
    const id = nieuwId('b');
    const bron = { id, naam, bytes, handle: handle || null, pdf, info };
    this.bronnen.set(id, bron);
    concept.bewaarBron(id, bron);
    return bron;
  }

  /* Opent bestanden (PDF's en/of foto's). Bij invoegen: na positie `na`. */
  async laadBestanden(lijst, { invoegenNa = null } = {}) {
    const b = bezig('Bestand openen…');
    const nieuwePaginas = [];
    try {
      const fotos = lijst.filter((k) => isFoto(k.bestand));
      const pdfs = lijst.filter((k) => !isFoto(k.bestand));
      for (const k of pdfs) {
        b.tekst(`"${k.bestand.name}" openen…`);
        const bytes = await leesAlsBytes(k.bestand);
        const res = await maakBewerkbaar(bytes, k.bestand.name);
        if (!res) continue;
        const bron = await this.voegBronToe(res.bytes, k.bestand.name, res.bytes === bytes ? k.handle : null);
        if (res.xfa) this.meldXfa(bron, res.velden);
        for (let i = 0; i < bron.info.length; i++) nieuwePaginas.push({ id: nieuwId('p'), bron: bron.id, index: i, draai: 0 });
      }
      if (fotos.length) {
        b.tekst('Foto\'s omzetten…');
        const bytes = await fotosAlsPdf(fotos.map((k) => k.bestand), {});
        const bron = await this.voegBronToe(bytes, fotos.length === 1 ? fotos[0].bestand.name : 'Foto\'s', null);
        for (let i = 0; i < bron.info.length; i++) nieuwePaginas.push({ id: nieuwId('p'), bron: bron.id, index: i, draai: 0 });
      }
    } catch (err) {
      melding(err.message || 'Openen mislukt.', 'fout', 7000);
    } finally {
      b.klaar();
    }
    if (!nieuwePaginas.length) return false;

    const eerste = !this.staat.paginas.length;
    if (eerste) {
      this.naam = basisNaam(lijst[0].bestand.name);
      this.staat.paginas = nieuwePaginas;
      this.historie = [];
      this.vastleggen(false);
      this.gewijzigd = lijst.length > 1;
    } else {
      const pos = invoegenNa == null ? this.staat.paginas.length : invoegenNa + 1;
      this.staat.paginas.splice(pos, 0, ...nieuwePaginas);
      this.vastleggen();
      melding(`${nieuwePaginas.length} pagina${nieuwePaginas.length === 1 ? '' : '\'s'} toegevoegd.`, 'goed');
    }
    this.toon();
    if (eerste) this.passend();
    else this.herteken();
    return true;
  }

  meldXfa(bron, velden) {
    if (velden > 0) {
      melding(`"${bron.naam}" bevat ook het oude Adobe-formulierformaat (XFA). Bladwerk gebruikt de gewone invulvelden; controleer het resultaat even.`, 'info', 9000);
    } else {
      dialoog({
        titel: 'Dit formulier kan hier niet worden ingevuld',
        inhoud: `"${bron.naam}" gebruikt het oude Adobe-formulierformaat (XFA). Dat werkt buiten Adobe Acrobat bijna nergens. Je kunt wel tekst, vinkjes en je handtekening op de pagina zetten, maar als de pagina leeg of met een melding verschijnt, vraag de instantie dan om een gewone PDF of vul het formulier in met Adobe Acrobat Reader.`,
      });
    }
  }

  async laadConcept(c) {
    const b = bezig('Verder waar je was…');
    try {
      for (const [id, rec] of Object.entries(c.bronnen)) {
        const pdf = await openPdfjs(rec.bytes);
        const info = [];
        for (let i = 0; i < pdf.numPages; i++) {
          const pg = await pdf.getPage(i + 1);
          const [x0, y0, x1, y1] = pg.view;
          info.push({ box: { x0, y0, w: x1 - x0, h: y1 - y0 }, rot: ((pg.rotate % 360) + 360) % 360 });
        }
        this.bronnen.set(id, { id, naam: rec.naam, bytes: rec.bytes, handle: rec.handle || null, pdf, info });
      }
      this.plaatjes = new Map(Object.entries(c.plaatjes || {}));
      this.staat = c.staat;
      this.naam = c.naam || 'document';
      this.historie = [];
      this.vastleggen(false);
      this.gewijzigd = !!c.gewijzigd;
    } finally {
      b.klaar();
    }
    this.toon();
    this.passend();
  }

  toon() {
    this.root.hidden = false;
    document.addEventListener('keydown', this._toetsen);
    window.addEventListener('beforeunload', this._voorVertrek);
    this.docNaamEl.textContent = this.naam;
    this.docNaamEl.title = this.naam;
  }

  /* ================= Historie en concept ================= */
  vastleggen(wijziging = true) {
    const s = JSON.stringify(this.staat);
    if (s !== this.historie[this.historie.length - 1]) {
      this.historie.push(s);
      if (this.historie.length > 100) this.historie.shift();
      this.toekomst = [];
      if (wijziging) this.gewijzigd = true;
    }
    this.werkKnoppenBij();
    this.bewaarConceptStraks();
  }

  ongedaan() {
    this.stopBewerken();
    if (this.historie.length < 2) return;
    this.toekomst.push(this.historie.pop());
    this.staat = JSON.parse(this.historie[this.historie.length - 1]);
    this.na_historie();
  }

  opnieuw() {
    this.stopBewerken();
    if (!this.toekomst.length) return;
    const s = this.toekomst.pop();
    this.historie.push(s);
    this.staat = JSON.parse(s);
    this.na_historie();
  }

  na_historie() {
    this.gewijzigd = true;
    this.gekozen = null;
    const geldig = new Set(this.staat.paginas.map((p) => p.id));
    for (const id of [...this.paginaKeuze]) if (!geldig.has(id)) this.paginaKeuze.delete(id);
    this.herteken();
    this.werkKnoppenBij();
    this.bewaarConceptStraks();
  }

  werkKnoppenBij() {
    this.knopTerug.disabled = this.historie.length < 2;
    this.knopVooruit.disabled = !this.toekomst.length;
  }

  bewaarConceptStraks() {
    clearTimeout(this._conceptTimer);
    this._conceptTimer = setTimeout(() => {
      const bronIds = [...new Set(this.staat.paginas.map((p) => p.bron))];
      concept.bewaarStand({
        naam: this.naam,
        tijd: Date.now(),
        bronIds,
        staat: this.staat,
        plaatjes: Object.fromEntries(this.plaatjes),
        gewijzigd: this.gewijzigd,
        aantal: this.staat.paginas.length,
      });
    }, 1200);
  }

  /* ================= Weergave ================= */
  pagina(pid) { return this.staat.paginas.find((p) => p.id === pid); }

  maat(p) {
    const info = this.bronnen.get(p.bron).info[p.index];
    const rot = (info.rot + (p.draai || 0)) % 360;
    return { ...schermMaat(info.box, rot), rot };
  }

  lijst(pid) {
    if (!this.staat.aantekeningen[pid]) this.staat.aantekeningen[pid] = [];
    return this.staat.aantekeningen[pid];
  }

  herteken() {
    this.bouwPaginas();
    this.bouwMiniaturen();
    this.toonEigenschappen();
  }

  bouwPaginas(behoudPositie = true) {
    let anker = null;
    if (behoudPositie && this.paginaEls.size) anker = this.positie();
    if (this.observer) this.observer.disconnect();
    this.paginasEl.innerHTML = '';
    this.paginaEls.clear();
    this.observer = new IntersectionObserver((items) => {
      for (const it of items) {
        const pid = it.target.dataset.id;
        if (it.isIntersecting) this.tekenPagina(pid);
        else this.wisPagina(pid);
      }
    }, { root: this.vlak, rootMargin: '1500px 0px' });

    const z = this.zoom;
    this.staat.paginas.forEach((p, i) => {
      const { w, h } = this.maat(p);
      const canvas = el('canvas', { class: 'pagina-beeld' });
      const laag = el('div', { class: 'laag' });
      const div = el('div', { class: 'pagina', 'data-id': p.id, style: { width: `${w * z}px`, height: `${h * z}px` } },
        canvas, laag);
      const omhulsel = el('div', { class: 'pagina-omhulsel' }, div, el('div', { class: 'pagina-nummer' }, `${i + 1}`));
      this.paginasEl.append(omhulsel);
      this.paginaEls.set(p.id, div);
      this.koppelLaag(p.id, laag);
      this.observer.observe(div);
    });
    this.zoomLabel.textContent = `${Math.round((this.zoom / PX_PER_PT) * 100)}%`;
    if (anker) this.herstelPositie(anker);
    this.werkHuidigeBij();
  }

  positie() {
    const top = this.vlak.scrollTop;
    for (const p of this.staat.paginas) {
      const div = this.paginaEls.get(p.id);
      if (!div) continue;
      const o = div.parentElement;
      if (o.offsetTop + o.offsetHeight > top) {
        return { pid: p.id, deel: (top - o.offsetTop) / Math.max(1, o.offsetHeight) };
      }
    }
    return null;
  }

  herstelPositie(anker) {
    const div = this.paginaEls.get(anker.pid);
    if (!div) return;
    const o = div.parentElement;
    this.vlak.scrollTop = o.offsetTop + anker.deel * o.offsetHeight;
  }

  naarPagina(pid) {
    const div = this.paginaEls.get(pid);
    if (div) this.vlak.scrollTo({ top: div.parentElement.offsetTop - 12, behavior: 'smooth' });
  }

  werkHuidigeBij() {
    const pos = this.positie();
    const idx = pos ? this.staat.paginas.findIndex((p) => p.id === pos.pid) : 0;
    this.huidig = pos ? pos.pid : null;
    this.paginaTeller.textContent = this.staat.paginas.length ? `Pagina ${idx + 1} van ${this.staat.paginas.length}` : '';
    for (const m of this.miniLijst.children) m.classList.toggle('huidig', m.dataset.id === this.huidig);
  }

  async tekenPagina(pid) {
    const p = this.pagina(pid);
    const div = this.paginaEls.get(pid);
    if (!p || !div) return;
    const bron = this.bronnen.get(p.bron);
    const page = await bron.pdf.getPage(p.index + 1);
    if (this.paginaEls.get(pid) !== div) return;
    const { rot } = this.maat(p);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: this.zoom * dpr, rotation: rot });
    const canvas = div.querySelector('canvas');
    if (div._taak) { div._taak.cancel(); div._taak = null; }
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const taak = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
    });
    div._taak = taak;
    this.tekenLaag(pid);
    try {
      await taak.promise;
      div.dataset.getekend = '1';
    } catch (err) {
      if (err && err.name !== 'RenderingCancelledException') console.warn('Tekenen mislukt', err);
    } finally {
      if (div._taak === taak) div._taak = null;
    }
  }

  wisPagina(pid) {
    const div = this.paginaEls.get(pid);
    if (!div) return;
    if (div._taak) { div._taak.cancel(); div._taak = null; }
    const c = div.querySelector('canvas');
    c.width = 0; c.height = 0;
    delete div.dataset.getekend;
    const laag = div.querySelector('.laag');
    if (!(this.bewerkt && this.bewerkt.pid === pid)) laag.innerHTML = '';
  }

  async widgets(p) {
    const sleutel = `${p.bron}:${p.index}`;
    if (!this.veldCache.has(sleutel)) {
      const page = await this.bronnen.get(p.bron).pdf.getPage(p.index + 1);
      const lijst = (await page.getAnnotations({ intent: 'display' }))
        .filter((a) => a.subtype === 'Widget' && a.fieldName && !a.hidden && a.fieldType);
      this.veldCache.set(sleutel, { page, lijst });
    }
    return this.veldCache.get(sleutel);
  }

  async tekenLaag(pid) {
    const p = this.pagina(pid);
    const div = this.paginaEls.get(pid);
    if (!p || !div) return;
    const laag = div.querySelector('.laag');
    const { page, lijst: velden } = await this.widgets(p);
    if (this.paginaEls.get(pid) !== div) return;
    laag.innerHTML = '';
    const { rot } = this.maat(p);
    if (velden.length) {
      const vp1 = page.getViewport({ scale: 1, rotation: rot });
      for (const w of velden) {
        const invoer = this.veldInvoer(p, w, vp1);
        if (invoer) laag.append(invoer);
      }
    }
    const volgorde = [...this.lijst(pid)].sort((x, y) => laagVolgorde(x) - laagVolgorde(y));
    for (const a of volgorde) laag.append(this.annEl(p, a));
    if (this.bewerkt && this.bewerkt.pid === pid) {
      const inhoud = laag.querySelector(`[data-id="${this.bewerkt.aid}"] .inhoud`);
      if (inhoud) {
        requestAnimationFrame(() => {
          inhoud.focus();
          const sel = window.getSelection();
          const r = document.createRange();
          r.selectNodeContents(inhoud);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        });
      }
    }
  }

  /* ---------- Invulvelden ---------- */
  veldWaarde(bronId, naam, standaard) {
    const f = this.staat.formulier[bronId];
    return f && Object.prototype.hasOwnProperty.call(f, naam) ? f[naam] : standaard;
  }

  zetVeld(bronId, naam, waarde) {
    if (!this.staat.formulier[bronId]) this.staat.formulier[bronId] = {};
    this.staat.formulier[bronId][naam] = waarde;
    // Hetzelfde veld kan op meerdere plekken staan.
    for (const inv of this.paginasEl.querySelectorAll('.veldinvoer')) {
      if (inv.dataset.bron !== bronId || inv.dataset.veld !== naam) continue;
      if (inv.type === 'checkbox') inv.checked = !!waarde;
      else if (inv.type === 'radio') inv.checked = inv.value === waarde;
      else if (inv !== document.activeElement) inv.value = waarde == null ? '' : waarde;
    }
    this.vastleggen();
  }

  veldInvoer(p, w, vp1) {
    const r = vp1.convertToViewportRectangle(w.rect);
    const z = this.zoom;
    const x = Math.min(r[0], r[2]);
    const y = Math.min(r[1], r[3]);
    const breedte = Math.abs(r[2] - r[0]);
    const hoogte = Math.abs(r[3] - r[1]);
    const stijl = { left: `${x * z}px`, top: `${y * z}px`, width: `${breedte * z}px`, height: `${hoogte * z}px` };
    const data = { 'data-bron': p.bron, 'data-veld': w.fieldName, class: 'veldinvoer', title: w.alternativeText || w.fieldName };
    let inv;
    if (w.fieldType === 'Tx') {
      const waarde = this.veldWaarde(p.bron, w.fieldName, w.fieldValue || '');
      const grootteTekst = w.textSize ? w.textSize : Math.min(hoogte * 0.7, 12);
      const tStijl = { ...stijl, fontSize: `${Math.max(grootteTekst, 6) * z}px`, textAlign: ['left', 'center', 'right'][w.textAlignment || 0] };
      inv = w.multiLine
        ? el('textarea', { ...data, style: tStijl, readonly: w.readOnly || null })
        : el('input', { ...data, type: 'text', style: tStijl, readonly: w.readOnly || null, maxlength: w.maxLen || null });
      inv.value = waarde;
      inv.addEventListener('change', () => this.zetVeld(p.bron, w.fieldName, inv.value));
    } else if (w.fieldType === 'Btn' && w.checkBox) {
      const standaard = !!w.fieldValue && w.fieldValue !== 'Off';
      inv = el('input', { ...data, type: 'checkbox', style: stijl, disabled: w.readOnly || null });
      inv.checked = !!this.veldWaarde(p.bron, w.fieldName, standaard);
      inv.addEventListener('change', () => this.zetVeld(p.bron, w.fieldName, inv.checked));
    } else if (w.fieldType === 'Btn' && w.radioButton) {
      inv = el('input', { ...data, type: 'radio', name: `${p.bron}-${w.fieldName}`, value: w.buttonValue, style: stijl, disabled: w.readOnly || null });
      inv.checked = this.veldWaarde(p.bron, w.fieldName, w.fieldValue) === w.buttonValue;
      inv.addEventListener('change', () => { if (inv.checked) this.zetVeld(p.bron, w.fieldName, w.buttonValue); });
    } else if (w.fieldType === 'Ch') {
      const huidigeWaarde = this.veldWaarde(p.bron, w.fieldName, Array.isArray(w.fieldValue) ? w.fieldValue[0] : w.fieldValue);
      inv = el('select', { ...data, style: { ...stijl, fontSize: `${Math.min(hoogte * 0.6, 12) * z}px` }, disabled: w.readOnly || null },
        el('option', { value: '' }, ''),
        (w.options || []).map((o) => el('option', { value: o.displayValue, selected: (o.displayValue === huidigeWaarde || o.exportValue === huidigeWaarde) || null }, o.displayValue)));
      inv.addEventListener('change', () => this.zetVeld(p.bron, w.fieldName, inv.value));
    } else {
      return null;
    }
    inv.addEventListener('pointerdown', (e) => e.stopPropagation());
    return inv;
  }

  /* ---------- Aantekeningen tekenen ---------- */
  annEl(p, a) {
    const z = this.zoom;
    const d = el('div', { class: `ann ann-${a.type}`, 'data-id': a.id });
    const plaats = () => {
      d.style.left = `${a.x * z}px`;
      d.style.top = `${a.y * z}px`;
      d.style.width = `${a.w * z}px`;
      d.style.height = `${a.h * z}px`;
    };
    plaats();
    const bewerkt = this.bewerkt && this.bewerkt.aid === a.id;

    switch (a.type) {
      case 'tekst':
      case 'datum': {
        d.style.width = 'auto';
        d.style.height = 'auto';
        d.style.minWidth = `${Math.max(a.grootte * 0.6, 4) * z}px`;
        const inhoud = el('div', { class: 'inhoud' });
        inhoud.textContent = a.tekst;
        this.tekstStijlToepassen(inhoud, a);
        d.append(inhoud);
        if (bewerkt) this.maakBewerkbaar(inhoud, p, a);
        break;
      }
      case 'correctie': {
        d.style.background = a.achtergrond || '#ffffff';
        const inhoud = el('div', { class: 'inhoud' });
        inhoud.textContent = a.tekst;
        this.tekstStijlToepassen(inhoud, a);
        const def = LETTERS[a.letter] || LETTERS.helv;
        inhoud.style.top = `${(a.basis - def.basis * a.grootte) * z}px`;
        d.append(inhoud);
        if (bewerkt) this.maakBewerkbaar(inhoud, p, a);
        break;
      }
      case 'handtekening': {
        const bron = this.plaatjes.get(a.beeld);
        if (bron) d.append(el('img', { src: bron, alt: 'Handtekening', draggable: 'false' }));
        break;
      }
      case 'markeren':
        d.style.background = a.kleur || '#ffe14d';
        break;
      case 'vinkje':
        d.append(el('span', { class: 'teken', style: { fontSize: `${a.h * z}px`, color: a.kleur || '#1a1a1a' } }, a.teken === 'x' ? '✘' : '✔'));
        break;
      case 'stempel': {
        d.style.color = a.kleur;
        d.style.borderColor = a.kleur;
        d.append(
          el('div', { class: 'stempel-tekst', style: { fontSize: `${Math.min(a.h * (a.datum ? 0.36 : 0.5), 26) * z}px` } }, String(a.tekst || '').toUpperCase()),
          a.datum ? el('div', { class: 'stempel-datum', style: { fontSize: `${Math.min(a.h * 0.2, 14) * z}px` } }, a.datum) : null);
        break;
      }
      case 'opmerking':
        d.append(icoon('opmerking', Math.max(14, 18 * z)));
        d.title = a.tekst || 'Opmerking';
        break;
      default:
        break;
    }
    if (this.gekozen && this.gekozen.aid === a.id) {
      d.classList.add('gekozen');
      if (['handtekening', 'markeren', 'stempel', 'vinkje', 'correctie'].includes(a.type)) {
        const greep = el('div', { class: 'greep', title: 'Sleep om de grootte te wijzigen' });
        greep.addEventListener('pointerdown', (e) => this.begrijpGreep(e, p, a, d));
        d.append(greep);
      }
    }
    d.addEventListener('pointerdown', (e) => this.annPointerDown(e, p, a, d));
    d.addEventListener('dblclick', (e) => {
      if (a.type === 'tekst' || a.type === 'datum' || a.type === 'correctie') {
        e.stopPropagation();
        this.bewerk(p.id, a.id);
      }
    });
    return d;
  }

  tekstStijlToepassen(inhoud, a) {
    const def = LETTERS[a.letter] || LETTERS.helv;
    inhoud.style.fontFamily = def.css;
    inhoud.style.fontSize = `${a.grootte * this.zoom}px`;
    inhoud.style.lineHeight = String(REGELHOOGTE);
    inhoud.style.fontWeight = a.vet ? '700' : '400';
    inhoud.style.color = a.kleur || '#000';
  }

  maakBewerkbaar(inhoud, p, a) {
    try { inhoud.contentEditable = 'plaintext-only'; } catch (_) { inhoud.contentEditable = 'true'; }
    if (inhoud.contentEditable !== 'plaintext-only') inhoud.contentEditable = 'true';
    inhoud.spellcheck = true;
    inhoud.setAttribute('lang', 'nl');
    inhoud.addEventListener('blur', () => this.stopBewerken());
    inhoud.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); this.stopBewerken(); }
      if (a.type === 'correctie' && e.key === 'Enter') e.preventDefault();
    });
    inhoud.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, a.type === 'correctie' ? t.replace(/\s*\n\s*/g, ' ') : t);
    });
    inhoud.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  bewerk(pid, aid) {
    this.stopBewerken();
    this.bewerkt = { pid, aid };
    this.gekozen = { pid, aid };
    this.tekenLaag(pid);
    this.toonEigenschappen();
  }

  stopBewerken() {
    if (!this.bewerkt) return;
    const { pid, aid } = this.bewerkt;
    this.bewerkt = null;
    const lijst = this.lijst(pid);
    const a = lijst.find((x) => x.id === aid);
    const div = this.paginaEls.get(pid);
    const inhoud = div && div.querySelector(`[data-id="${aid}"] .inhoud`);
    if (a && inhoud) {
      let tekst = inhoud.innerText.replace(/ /g, ' ').replace(/\n$/, '');
      if (a.type === 'correctie') tekst = tekst.replace(/\n/g, ' ');
      a.tekst = tekst;
      if (!tekst.trim() && a.type !== 'correctie') {
        lijst.splice(lijst.indexOf(a), 1);
        if (this.gekozen && this.gekozen.aid === aid) this.gekozen = null;
      } else {
        this.meetTekst(a);
      }
    }
    this.tekenLaag(pid);
    this.toonEigenschappen();
    this.vastleggen();
  }

  meetTekst(a) {
    const c = this._meetCanvas || (this._meetCanvas = document.createElement('canvas'));
    const ctx = c.getContext('2d');
    const def = LETTERS[a.letter] || LETTERS.helv;
    ctx.font = `${a.vet ? 700 : 400} ${a.grootte}px ${def.css}`;
    const regels = String(a.tekst || '').split('\n');
    const breedste = Math.max(...regels.map((r) => ctx.measureText(r).width), a.grootte * 0.6);
    if (a.type === 'correctie') {
      a.w = Math.max(a.minW || a.w, breedste + 2);
    } else {
      a.w = breedste + 1;
      a.h = regels.length * a.grootte * REGELHOOGTE;
    }
  }

  /* ---------- Muis en aanraking op de pagina ---------- */
  punt(e, laag) {
    const r = laag.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
  }

  koppelLaag(pid, laag) {
    laag.addEventListener('pointerdown', (e) => this.laagPointerDown(e, pid, laag));
    laag.addEventListener('pointermove', (e) => { if (this.gereedschap === 'corrigeren') this.toonCorrectieDoel(e, pid, laag); });
    laag.addEventListener('pointerleave', () => { const h = laag.querySelector('.correctie-doel'); if (h) h.remove(); });
  }

  laagPointerDown(e, pid, laag) {
    if (e.button !== 0) return;
    if (e.target.closest('.ann') || e.target.closest('.veldinvoer')) return;
    this.stopBewerken();
    const p = this.pagina(pid);
    const { w: pw, h: ph } = this.maat(p);
    const { x, y } = this.punt(e, laag);
    const t = this.gereedschap;
    const lijst = this.lijst(pid);
    const blijf = (v, min, max) => Math.max(min, Math.min(max, v));

    if (t === 'kiezen') {
      this.kies(null);
      return;
    }
    e.preventDefault();

    if (t === 'tekst') {
      const s = this.tekstStijl;
      const a = { id: nieuwId('a'), type: 'tekst', x: blijf(x, 0, pw - 10), y: blijf(y - s.grootte * 0.6, 0, ph - s.grootte), w: 10, h: s.grootte * REGELHOOGTE, tekst: '', ...s };
      lijst.push(a);
      this.bewerk(pid, a.id);
      return;
    }
    if (t === 'datum') {
      const s = this.tekstStijl;
      const a = { id: nieuwId('a'), type: 'datum', x, y: y - s.grootte * 0.6, w: 10, h: s.grootte * REGELHOOGTE, tekst: vandaag(), ...s };
      this.meetTekst(a);
      a.x = blijf(a.x, 0, pw - a.w); a.y = blijf(a.y, 0, ph - a.h);
      lijst.push(a);
      this.naPlaatsen(pid, a, true);
      return;
    }
    if (t === 'vinkje' || t === 'kruisje') {
      const m = 14;
      const a = { id: nieuwId('a'), type: 'vinkje', teken: t === 'kruisje' ? 'x' : 'v', x: blijf(x - m / 2, 0, pw - m), y: blijf(y - m / 2, 0, ph - m), w: m, h: m, kleur: '#1a1a1a' };
      lijst.push(a);
      this.naPlaatsen(pid, a, false);
      return;
    }
    if (t === 'handtekening') {
      const h = haalHandtekening();
      if (!h) return;
      let sleutel = [...this.plaatjes.entries()].find(([, v]) => v === h.bron);
      sleutel = sleutel ? sleutel[0] : nieuwId('h');
      this.plaatjes.set(sleutel, h.bron);
      const breedte = Math.min(160, pw * 0.4);
      const hoogte = breedte * (h.hoogte / h.breedte);
      const a = { id: nieuwId('a'), type: 'handtekening', beeld: sleutel, x: blijf(x - breedte / 2, 0, pw - breedte), y: blijf(y - hoogte / 2, 0, ph - hoogte), w: breedte, h: hoogte };
      lijst.push(a);
      this.naPlaatsen(pid, a, true);
      return;
    }
    if (t === 'opmerking') {
      const a = { id: nieuwId('a'), type: 'opmerking', x: blijf(x - 10, 0, pw - 20), y: blijf(y - 10, 0, ph - 20), w: 20, h: 20, tekst: '' };
      lijst.push(a);
      this.naPlaatsen(pid, a, true);
      setTimeout(() => { const ta = this.eigenschapEl.querySelector('textarea'); if (ta) ta.focus(); }, 50);
      return;
    }
    if (t === 'stempel') {
      const s = this.stempel;
      const w = 170;
      const h = s.datum ? 56 : 42;
      const a = { id: nieuwId('a'), type: 'stempel', tekst: s.tekst, datum: s.datum ? vandaag() : '', kleur: s.kleur, x: blijf(x - w / 2, 0, pw - w), y: blijf(y - h / 2, 0, ph - h), w, h };
      lijst.push(a);
      this.naPlaatsen(pid, a, true);
      return;
    }
    if (t === 'markeren') {
      this.trekMarkering(e, pid, laag, x, y);
      return;
    }
    if (t === 'corrigeren') {
      this.maakCorrectie(e, pid, laag, x, y);
    }
  }

  naPlaatsen(pid, a, terugNaarKiezen) {
    this.gekozen = { pid, aid: a.id };
    if (terugNaarKiezen) { this.gereedschap = 'kiezen'; this.werkGereedschapBij(); }
    this.tekenLaag(pid);
    this.toonEigenschappen();
    this.vastleggen();
  }

  trekMarkering(e, pid, laag, x0, y0) {
    const z = this.zoom;
    const vak = el('div', { class: 'ann ann-markeren', style: { background: this.markeerKleur, left: `${x0 * z}px`, top: `${y0 * z}px`, width: '0px', height: '0px' } });
    laag.append(vak);
    laag.setPointerCapture(e.pointerId);
    let x1 = x0;
    let y1 = y0;
    const beweeg = (ev) => {
      ({ x: x1, y: y1 } = this.punt(ev, laag));
      vak.style.left = `${Math.min(x0, x1) * z}px`;
      vak.style.top = `${Math.min(y0, y1) * z}px`;
      vak.style.width = `${Math.abs(x1 - x0) * z}px`;
      vak.style.height = `${Math.abs(y1 - y0) * z}px`;
    };
    const klaar = () => {
      laag.removeEventListener('pointermove', beweeg);
      laag.removeEventListener('pointerup', klaar);
      laag.removeEventListener('pointercancel', klaar);
      vak.remove();
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      if (w < 4 || h < 3) return;
      const a = { id: nieuwId('a'), type: 'markeren', x: Math.min(x0, x1), y: Math.min(y0, y1), w, h, kleur: this.markeerKleur };
      this.lijst(pid).push(a);
      this.naPlaatsen(pid, a, false);
    };
    laag.addEventListener('pointermove', beweeg);
    laag.addEventListener('pointerup', klaar);
    laag.addEventListener('pointercancel', klaar);
  }

  /* ---------- Corrigeren: bestaande tekst vinden ---------- */
  async tekstItems(p) {
    const { rot } = this.maat(p);
    const sleutel = `${p.bron}:${p.index}:${rot}`;
    if (this.tekstCache.has(sleutel)) return this.tekstCache.get(sleutel);
    const page = await this.bronnen.get(p.bron).pdf.getPage(p.index + 1);
    const vp = page.getViewport({ scale: 1, rotation: rot });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      const hoogte = Math.hypot(t[2], t[3]);
      if (Math.abs(Math.atan2(t[1], t[0])) > 0.02 || hoogte < 2) continue;
      const stijl = tc.styles[it.fontName] || {};
      const asc = stijl.ascent || 0.8;
      const desc = stijl.descent || -0.2;
      const familie = (stijl.fontFamily || '').toLowerCase();
      const letter = familie.includes('mono') ? 'courier' : familie.includes('serif') && !familie.includes('sans') ? 'times' : 'helv';
      items.push({
        tekst: it.str,
        links: t[4],
        basis: t[5],
        boven: t[5] - asc * hoogte,
        onder: t[5] - desc * hoogte,
        breedte: it.width,
        grootte: Math.round(hoogte * 10) / 10,
        letter,
        vet: /bold|black|heavy|semibold/i.test(it.fontName + ' ' + (stijl.fontFamily || '')),
      });
    }
    this.tekstCache.set(sleutel, items);
    return items;
  }

  async zoekItem(p, x, y) {
    const items = await this.tekstItems(p);
    return items.find((i) => x >= i.links - 1 && x <= i.links + i.breedte + 1 && y >= i.boven - 1 && y <= i.onder + 1) || null;
  }

  async toonCorrectieDoel(e, pid, laag) {
    const p = this.pagina(pid);
    const { x, y } = this.punt(e, laag);
    const item = await this.zoekItem(p, x, y);
    let h = laag.querySelector('.correctie-doel');
    if (!item) { if (h) h.remove(); return; }
    if (!h) { h = el('div', { class: 'correctie-doel' }); laag.append(h); }
    const z = this.zoom;
    Object.assign(h.style, {
      left: `${(item.links - 1) * z}px`, top: `${(item.boven - 1) * z}px`,
      width: `${(item.breedte + 2) * z}px`, height: `${(item.onder - item.boven + 2) * z}px`,
    });
  }

  monsterKleuren(pid, vak) {
    const div = this.paginaEls.get(pid);
    const canvas = div && div.querySelector('canvas');
    const uit = { achtergrond: '#ffffff', tekst: '#000000' };
    if (!canvas || !canvas.width || !div.dataset.getekend) return uit;
    const s = canvas.width / (parseFloat(div.style.width) / this.zoom);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const lees = (x, y, w, h) => {
      const xi = Math.max(0, Math.round(x * s));
      const yi = Math.max(0, Math.round(y * s));
      const wi = Math.max(1, Math.min(canvas.width - xi, Math.round(w * s)));
      const hi = Math.max(1, Math.min(canvas.height - yi, Math.round(h * s)));
      try { return ctx.getImageData(xi, yi, wi, hi).data; } catch (_) { return null; }
    };
    const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    // Achtergrond: rand net boven en onder het vak.
    const randen = [lees(vak.x, vak.y - 2, vak.w, 1.5), lees(vak.x, vak.y + vak.h + 0.5, vak.w, 1.5)].filter(Boolean);
    const kleuren = [];
    for (const d of randen) for (let i = 0; i < d.length; i += 4) kleuren.push([d[i], d[i + 1], d[i + 2]]);
    if (kleuren.length) {
      kleuren.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const m = kleuren[Math.floor(kleuren.length * 0.75)];
      uit.achtergrond = hex(...m);
    }
    // Tekstkleur: donkerste pixels binnen het vak.
    const binnen = lees(vak.x, vak.y, vak.w, vak.h);
    if (binnen) {
      let best = null;
      for (let i = 0; i < binnen.length; i += 4) {
        const l = binnen[i] + binnen[i + 1] + binnen[i + 2];
        if (!best || l < best[3]) best = [binnen[i], binnen[i + 1], binnen[i + 2], l];
      }
      if (best && best[3] < 600) uit.tekst = hex(best[0], best[1], best[2]);
    }
    return uit;
  }

  async maakCorrectie(e, pid, laag, x, y) {
    const p = this.pagina(pid);
    const item = await this.zoekItem(p, x, y);
    if (!item) {
      melding('Hier vind ik geen tekst om te verbeteren. Bij een scan maak je eerst de pagina doorzoekbaar (rechts onder "Meer"), of gebruik je het gereedschap Tekst.', 'info', 7000);
      return;
    }
    const vak = { x: item.links - 1, y: item.boven - 1, w: item.breedte + 2, h: item.onder - item.boven + 2 };
    const kleuren = this.monsterKleuren(pid, vak);
    const a = {
      id: nieuwId('a'), type: 'correctie', ...vak, minW: vak.w,
      basis: item.basis - vak.y, tekst: item.tekst, grootte: item.grootte,
      letter: item.letter, vet: item.vet, kleur: kleuren.tekst, achtergrond: kleuren.achtergrond,
    };
    const h = laag.querySelector('.correctie-doel');
    if (h) h.remove();
    this.lijst(pid).push(a);
    this.gereedschap = 'kiezen';
    this.werkGereedschapBij();
    this.bewerk(pid, a.id);
  }

  /* ---------- Selecteren, verplaatsen, vergroten ---------- */
  kies(gekozen) {
    const oud = this.gekozen;
    this.gekozen = gekozen;
    if (oud) this.tekenLaag(oud.pid);
    if (gekozen && (!oud || oud.pid !== gekozen.pid)) this.tekenLaag(gekozen.pid);
    this.toonEigenschappen();
  }

  annPointerDown(e, p, a, d) {
    if (e.button !== 0) return;
    if (this.bewerkt && this.bewerkt.aid === a.id) return;
    e.stopPropagation();
    e.preventDefault();
    this.stopBewerken();
    if (!this.gekozen || this.gekozen.aid !== a.id) {
      this.gekozen = { pid: p.id, aid: a.id };
      this.toonEigenschappen();
      for (const x of this.paginasEl.querySelectorAll('.ann.gekozen')) x.classList.remove('gekozen');
      d.classList.add('gekozen');
      this._herteken = true;
    }
    const laag = d.parentElement;
    const start = this.punt(e, laag);
    const ox = a.x;
    const oy = a.y;
    const { w: pw, h: ph } = this.maat(p);
    let bewogen = false;
    d.setPointerCapture(e.pointerId);
    const beweeg = (ev) => {
      const q = this.punt(ev, laag);
      const dx = q.x - start.x;
      const dy = q.y - start.y;
      if (!bewogen && Math.hypot(dx, dy) < 1.5) return;
      bewogen = true;
      a.x = Math.max(0, Math.min(pw - Math.min(a.w, pw), ox + dx));
      a.y = Math.max(0, Math.min(ph - Math.min(a.h, ph), oy + dy));
      d.style.left = `${a.x * this.zoom}px`;
      d.style.top = `${a.y * this.zoom}px`;
    };
    const klaar = () => {
      d.removeEventListener('pointermove', beweeg);
      d.removeEventListener('pointerup', klaar);
      d.removeEventListener('pointercancel', klaar);
      if (bewogen) this.vastleggen();
      if (bewogen || this._herteken) { this._herteken = false; this.tekenLaag(p.id); }
      if (!bewogen && a.type === 'opmerking') {
        const ta = this.eigenschapEl.querySelector('textarea');
        if (ta) ta.focus();
      }
    };
    d.addEventListener('pointermove', beweeg);
    d.addEventListener('pointerup', klaar);
    d.addEventListener('pointercancel', klaar);
  }

  begrijpGreep(e, p, a, d) {
    e.stopPropagation();
    e.preventDefault();
    const laag = d.parentElement;
    const start = this.punt(e, laag);
    const ow = a.w;
    const oh = a.h;
    const verhouding = oh / ow;
    const vast = a.type === 'handtekening' || a.type === 'vinkje';
    const { w: pw, h: ph } = this.maat(p);
    const greep = e.target;
    greep.setPointerCapture(e.pointerId);
    const beweeg = (ev) => {
      const q = this.punt(ev, laag);
      let w = Math.max(8, Math.min(pw - a.x, ow + (q.x - start.x)));
      let h = vast ? w * verhouding : Math.max(6, Math.min(ph - a.y, oh + (q.y - start.y)));
      if (vast && a.y + h > ph) { h = ph - a.y; w = h / verhouding; }
      if (a.type === 'correctie') h = oh;
      a.w = w; a.h = h;
      d.style.width = `${w * this.zoom}px`;
      d.style.height = `${h * this.zoom}px`;
      const teken = d.querySelector('.teken');
      if (teken) teken.style.fontSize = `${h * this.zoom}px`;
    };
    const klaar = () => {
      greep.removeEventListener('pointermove', beweeg);
      greep.removeEventListener('pointerup', klaar);
      if (a.type === 'correctie') a.minW = a.w;
      this.vastleggen();
      this.tekenLaag(p.id);
    };
    greep.addEventListener('pointermove', beweeg);
    greep.addEventListener('pointerup', klaar);
  }

  verwijderGekozen() {
    if (!this.gekozen) return;
    const { pid, aid } = this.gekozen;
    const lijst = this.lijst(pid);
    const i = lijst.findIndex((a) => a.id === aid);
    if (i >= 0) lijst.splice(i, 1);
    this.gekozen = null;
    this.bewerkt = null;
    this.tekenLaag(pid);
    this.toonEigenschappen();
    this.vastleggen();
  }

  /* ---------- Eigenschappen van wat gekozen is ---------- */
  gekozenAnn() {
    if (!this.gekozen) return null;
    const lijst = this.staat.aantekeningen[this.gekozen.pid] || [];
    return lijst.find((a) => a.id === this.gekozen.aid) || null;
  }

  kleurKeuze(kleuren, huidig, opKeuze) {
    const rij = el('div', { class: 'kleuren' });
    for (const [k, naam] of kleuren) {
      const b = el('button', { type: 'button', class: `kleur${k === huidig ? ' actief' : ''}`, title: naam, 'aria-label': naam, style: { background: k } });
      b.addEventListener('click', () => {
        for (const x of rij.children) x.classList.remove('actief');
        b.classList.add('actief');
        opKeuze(k);
      });
      rij.append(b);
    }
    return rij;
  }

  wijzig(a, fn, { meten = false, vastleggenNu = true } = {}) {
    fn(a);
    if (meten) this.meetTekst(a);
    this.tekenLaag(this.gekozen.pid);
    if (vastleggenNu) this.vastleggen();
  }

  toonEigenschappen() {
    const a = this.gekozenAnn();
    const e = this.eigenschapEl;
    e.innerHTML = '';
    if (!a) { e.hidden = true; return; }
    e.hidden = false;
    const namen = { tekst: 'Tekst', datum: 'Datum', correctie: 'Correctie', handtekening: 'Handtekening', markeren: 'Markering', vinkje: a.teken === 'x' ? 'Kruisje' : 'Vinkje', stempel: 'Stempel', opmerking: 'Opmerking' };
    e.append(el('h3', {}, namen[a.type] || 'Gekozen'));

    if (['tekst', 'datum', 'correctie'].includes(a.type)) {
      const letter = el('select', { class: 'veld' },
        el('option', { value: 'helv', selected: a.letter === 'helv' || null }, 'Schreefloos'),
        el('option', { value: 'times', selected: a.letter === 'times' || null }, 'Met schreef'),
        el('option', { value: 'courier', selected: a.letter === 'courier' || null }, 'Typemachine'));
      letter.addEventListener('change', () => this.wijzig(a, (x) => { x.letter = letter.value; this.tekstStijl.letter = x.letter; }, { meten: true }));
      const maat = el('input', { type: 'number', class: 'veld veld-smal', min: 5, max: 96, step: 0.5, value: a.grootte });
      maat.addEventListener('change', () => {
        const v = Math.max(5, Math.min(96, Number(maat.value) || a.grootte));
        this.wijzig(a, (x) => { x.grootte = v; if (x.type !== 'correctie') this.tekstStijl.grootte = v; }, { meten: true });
      });
      const vet = el('input', { type: 'checkbox', checked: a.vet || null });
      vet.addEventListener('change', () => this.wijzig(a, (x) => { x.vet = vet.checked; }, { meten: true }));
      e.append(
        el('label', { class: 'label' }, 'Lettertype', letter),
        el('div', { class: 'rij' }, el('label', { class: 'label' }, 'Grootte', maat), el('label', { class: 'vinklabel' }, vet, 'Vet')),
        el('div', { class: 'label' }, 'Kleur'),
        this.kleurKeuze(TEKSTKLEUREN, a.kleur, (k) => this.wijzig(a, (x) => { x.kleur = k; if (x.type !== 'correctie') this.tekstStijl.kleur = k; })));
      if (a.type === 'correctie') {
        const ag = el('input', { type: 'color', class: 'kleurveld', value: a.achtergrond || '#ffffff' });
        ag.addEventListener('change', () => this.wijzig(a, (x) => { x.achtergrond = ag.value; }));
        e.append(el('label', { class: 'label' }, 'Achtergrondkleur', ag),
          el('p', { class: 'klein' }, 'De oude tekst wordt afgedekt met deze kleur. Dubbelklik om de tekst te wijzigen.'));
      } else {
        e.append(el('p', { class: 'klein' }, 'Dubbelklik op de tekst om hem te wijzigen.'));
      }
      e.append(knop('Tekst wijzigen', { klik: () => this.bewerk(this.gekozen.pid, a.id) }));
    }
    if (a.type === 'markeren') {
      e.append(this.kleurKeuze(MARKEERKLEUREN, a.kleur, (k) => { this.markeerKleur = k; this.wijzig(a, (x) => { x.kleur = k; }); }));
    }
    if (a.type === 'vinkje') {
      const keuze = el('select', { class: 'veld' },
        el('option', { value: 'v', selected: a.teken !== 'x' || null }, 'Vinkje ✔'),
        el('option', { value: 'x', selected: a.teken === 'x' || null }, 'Kruisje ✘'));
      keuze.addEventListener('change', () => this.wijzig(a, (x) => { x.teken = keuze.value; }));
      e.append(keuze, this.kleurKeuze(TEKSTKLEUREN, a.kleur, (k) => this.wijzig(a, (x) => { x.kleur = k; })));
    }
    if (a.type === 'stempel') {
      const keuze = el('select', { class: 'veld' }, STEMPELS.map((s) => el('option', { value: s, selected: s === a.tekst || null }, s)));
      keuze.addEventListener('change', () => this.wijzig(a, (x) => { x.tekst = keuze.value; }));
      const datum = el('input', { type: 'checkbox', checked: !!a.datum || null });
      datum.addEventListener('change', () => this.wijzig(a, (x) => { x.datum = datum.checked ? vandaag() : ''; }));
      e.append(keuze, el('label', { class: 'vinklabel' }, datum, 'Met datum'),
        this.kleurKeuze(STEMPELKLEUREN, a.kleur, (k) => this.wijzig(a, (x) => { x.kleur = k; })));
    }
    if (a.type === 'opmerking') {
      const ta = el('textarea', { class: 'veld', rows: 5, placeholder: 'Schrijf hier je opmerking…' });
      ta.value = a.tekst || '';
      ta.addEventListener('keydown', (ev) => ev.stopPropagation());
      ta.addEventListener('change', () => this.wijzig(a, (x) => { x.tekst = ta.value; }));
      e.append(ta, el('p', { class: 'klein' }, 'De opmerking wordt een echte PDF-opmerking: in Acrobat en Voorvertoning zie je hem als notitie.'));
    }
    if (a.type === 'handtekening') {
      e.append(el('p', { class: 'klein' }, 'Sleep om te verplaatsen; sleep het hoekje rechtsonder om de grootte te wijzigen.'));
    }
    e.append(knop('Verwijderen', { icoon: 'weg', soort: 'gevaar', klik: () => this.verwijderGekozen() }));
  }

  /* ================= Miniaturen en paginabeheer ================= */
  bouwMiniaturen() {
    if (this.miniObserver) this.miniObserver.disconnect();
    this.miniLijst.innerHTML = '';
    this.miniObserver = new IntersectionObserver((items) => {
      for (const it of items) if (it.isIntersecting) { this.tekenMini(it.target); this.miniObserver.unobserve(it.target); }
    }, { root: this.miniLijst, rootMargin: '400px 0px' });
    this.staat.paginas.forEach((p, i) => {
      const { w, h } = this.maat(p);
      const breedte = 104;
      const hoogte = Math.round(breedte * (h / w));
      const canvas = el('canvas', { style: { width: `${breedte}px`, height: `${hoogte}px` } });
      const m = el('div', {
        class: `mini${this.paginaKeuze.has(p.id) ? ' gekozen' : ''}`,
        'data-id': p.id, draggable: 'true', tabindex: '0', role: 'button',
        'aria-label': `Pagina ${i + 1}`,
      },
      el('div', { class: 'mini-beeld' }, canvas,
        (this.staat.aantekeningen[p.id] || []).length ? el('span', { class: 'mini-stip', title: 'Heeft aantekeningen' }) : null),
      el('div', { class: 'mini-onder' },
        el('span', {}, String(i + 1)),
        el('span', { class: 'mini-acties' },
          el('button', { type: 'button', title: 'Linksom draaien', onclick: (e) => { e.stopPropagation(); this.draaiPaginas(-90, [p.id]); } }, icoon('links', 14)),
          el('button', { type: 'button', title: 'Rechtsom draaien', onclick: (e) => { e.stopPropagation(); this.draaiPaginas(90, [p.id]); } }, icoon('rechts', 14)),
          el('button', { type: 'button', title: 'Verwijderen', onclick: (e) => { e.stopPropagation(); this.verwijderPaginas([p.id]); } }, icoon('weg', 14)))));
      m.addEventListener('click', (e) => this.miniKlik(e, p.id));
      m.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.miniKlik(e, p.id); } });
      this.miniLijst.append(m);
      this.miniObserver.observe(m);
    });
    this.werkHuidigeBij();
  }

  async tekenMini(m) {
    const p = this.pagina(m.dataset.id);
    if (!p) return;
    const canvas = m.querySelector('canvas');
    const page = await this.bronnen.get(p.bron).pdf.getPage(p.index + 1);
    const { rot, w } = this.maat(p);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: (104 / w) * dpr, rotation: rot });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    try {
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch (_) { /* afgebroken */ }
  }

  miniKlik(e, pid) {
    const ids = this.staat.paginas.map((p) => p.id);
    if (e.shiftKey && this.laatsteKlik && ids.includes(this.laatsteKlik)) {
      const [a, b] = [ids.indexOf(this.laatsteKlik), ids.indexOf(pid)].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) this.paginaKeuze.add(ids[i]);
    } else if (e.metaKey || e.ctrlKey) {
      if (this.paginaKeuze.has(pid)) this.paginaKeuze.delete(pid); else this.paginaKeuze.add(pid);
      this.laatsteKlik = pid;
    } else {
      this.paginaKeuze = new Set([pid]);
      this.laatsteKlik = pid;
      this.naarPagina(pid);
    }
    for (const m of this.miniLijst.children) m.classList.toggle('gekozen', this.paginaKeuze.has(m.dataset.id));
  }

  /* Gekozen pagina's, of anders de pagina die nu in beeld is. */
  doelPaginas(ids) {
    if (ids && ids.length) return ids;
    const gekozen = this.staat.paginas.filter((p) => this.paginaKeuze.has(p.id)).map((p) => p.id);
    if (gekozen.length) return gekozen;
    return this.huidig ? [this.huidig] : [];
  }

  draaiPaginas(graden, ids) {
    this.stopBewerken();
    const doel = this.doelPaginas(ids);
    if (!doel.length) return;
    for (const pid of doel) {
      const p = this.pagina(pid);
      const { w: dW, h: dH } = this.maat(p);
      for (const a of this.staat.aantekeningen[pid] || []) {
        const cx = a.x + a.w / 2;
        const cy = a.y + a.h / 2;
        let nx;
        let ny;
        if (graden > 0) { nx = dH - cy; ny = cx; } else { nx = cy; ny = dW - cx; }
        a.x = nx - a.w / 2;
        a.y = ny - a.h / 2;
      }
      p.draai = (((p.draai || 0) + graden) % 360 + 360) % 360;
    }
    this.vastleggen();
    this.herteken();
  }

  async verwijderPaginas(ids) {
    this.stopBewerken();
    const doel = this.doelPaginas(ids);
    if (!doel.length) return;
    if (doel.length >= this.staat.paginas.length) {
      melding('Je kunt niet alle pagina\'s verwijderen. Er moet er minstens één overblijven.', 'fout');
      return;
    }
    if (doel.length > 1 && !(await bevestig('Pagina\'s verwijderen', `${doel.length} pagina's verwijderen? Dit kun je ongedaan maken.`, 'Verwijderen', true))) return;
    const weg = new Set(doel);
    this.staat.paginas = this.staat.paginas.filter((p) => !weg.has(p.id));
    for (const id of doel) { delete this.staat.aantekeningen[id]; this.paginaKeuze.delete(id); }
    if (this.gekozen && weg.has(this.gekozen.pid)) this.gekozen = null;
    this.vastleggen();
    this.herteken();
  }

  verplaatsPaginas(ids, voorIndex) {
    const zet = new Set(ids);
    const blok = this.staat.paginas.filter((p) => zet.has(p.id));
    const rest = this.staat.paginas.filter((p) => !zet.has(p.id));
    const voorId = this.staat.paginas[voorIndex] && this.staat.paginas[voorIndex].id;
    let pos = rest.length;
    if (voorId) {
      const i = rest.findIndex((p) => p.id === voorId);
      if (i >= 0) pos = i;
      else {
        // Doel ligt binnen het verplaatste blok: zoek de eerste niet-verplaatste pagina erna.
        for (let k = voorIndex; k < this.staat.paginas.length; k++) {
          const j = rest.findIndex((p) => p.id === this.staat.paginas[k].id);
          if (j >= 0) { pos = j; break; }
        }
      }
    }
    rest.splice(pos, 0, ...blok);
    const voor = this.staat.paginas.map((p) => p.id).join();
    this.staat.paginas = rest;
    if (rest.map((p) => p.id).join() === voor) return;
    this.vastleggen();
    this.herteken();
  }

  koppelSlepen() {
    let gesleept = null;
    const streep = el('div', { class: 'invoeg-streep' });
    this.miniLijst.addEventListener('dragstart', (e) => {
      const m = e.target.closest('.mini');
      if (!m) return;
      gesleept = this.paginaKeuze.has(m.dataset.id)
        ? this.staat.paginas.filter((p) => this.paginaKeuze.has(p.id)).map((p) => p.id)
        : [m.dataset.id];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-bladwerk', m.dataset.id);
      m.classList.add('sleept');
    });
    this.miniLijst.addEventListener('dragend', () => {
      gesleept = null;
      streep.remove();
      for (const m of this.miniLijst.querySelectorAll('.sleept')) m.classList.remove('sleept');
    });
    const doelIndex = (e) => {
      const minis = [...this.miniLijst.querySelectorAll('.mini')];
      for (let i = 0; i < minis.length; i++) {
        const r = minis[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) return { i, el: minis[i] };
      }
      return { i: minis.length, el: null };
    };
    this.miniLijst.addEventListener('dragover', (e) => {
      const bestanden = e.dataTransfer.types.includes('Files');
      if (!gesleept && !bestanden) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = gesleept ? 'move' : 'copy';
      const { el: voor } = doelIndex(e);
      if (voor) this.miniLijst.insertBefore(streep, voor); else this.miniLijst.append(streep);
    });
    this.miniLijst.addEventListener('dragleave', (e) => { if (!this.miniLijst.contains(e.relatedTarget)) streep.remove(); });
    this.miniLijst.addEventListener('drop', async (e) => {
      e.preventDefault();
      streep.remove();
      const { i } = doelIndex(e);
      if (gesleept) {
        this.verplaatsPaginas(gesleept, i);
        gesleept = null;
      } else if (e.dataTransfer.files.length) {
        const lijst = await bestandenUitSlepen(e.dataTransfer);
        this.laadBestanden(lijst, { invoegenNa: i - 1 });
      }
    });
    // Bestanden op de pagina's slepen: achteraan toevoegen.
    this.vlak.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); this.vlak.classList.add('sleepdoel'); }
    });
    this.vlak.addEventListener('dragleave', (e) => { if (!this.vlak.contains(e.relatedTarget)) this.vlak.classList.remove('sleepdoel'); });
    this.vlak.addEventListener('drop', async (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      this.vlak.classList.remove('sleepdoel');
      const lijst = await bestandenUitSlepen(e.dataTransfer);
      this.laadBestanden(lijst);
    });
  }

  async paginasToevoegen() {
    const lijst = await kiesBestanden({ meerdere: true, soort: 'pdfOfFoto' });
    if (!lijst.length) return;
    const gekozen = this.staat.paginas.map((p, i) => (this.paginaKeuze.has(p.id) ? i : -1)).filter((i) => i >= 0);
    const na = gekozen.length ? Math.max(...gekozen) : this.staat.paginas.length - 1;
    await this.laadBestanden(lijst, { invoegenNa: na });
  }

  /* ================= Bouwen en opslaan ================= */
  staatVoorBouwen(paginaIds = null) {
    const staat = JSON.parse(JSON.stringify(this.staat));
    if (paginaIds) {
      const zet = new Set(paginaIds);
      staat.paginas = staat.paginas.filter((p) => zet.has(p.id));
    }
    for (const lijst of Object.values(staat.aantekeningen)) {
      for (const a of lijst) if (a.beeld) a.bron = this.plaatjes.get(a.beeld);
    }
    staat.bronnen = {};
    for (const p of staat.paginas) staat.bronnen[p.bron] = { bytes: this.bronnen.get(p.bron).bytes };
    return staat;
  }

  async bouw(opties = {}, paginaIds = null) {
    this.stopBewerken();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return bouwPdf(PDFLib, this.staatVoorBouwen(paginaIds), { ...BOUW_OPTIES, titel: this.naam, ...opties });
  }

  enkeleBron() {
    const ids = [...new Set(this.staat.paginas.map((p) => p.bron))];
    return ids.length === 1 ? this.bronnen.get(ids[0]) : null;
  }

  voorgesteldeNaam() {
    const alle = Object.values(this.staat.aantekeningen).flat();
    let achtervoegsel = 'bewerkt';
    if (alle.some((a) => a.type === 'handtekening')) achtervoegsel = 'ondertekend';
    else if (Object.keys(this.staat.formulier).length || alle.some((a) => ['tekst', 'datum', 'vinkje'].includes(a.type))) achtervoegsel = 'ingevuld';
    return `${this.naam} (${achtervoegsel}).pdf`;
  }

  async opslaan() {
    this.stopBewerken();
    const bron = this.enkeleBron();
    const heeftVelden = [...new Set(this.staat.paginas.map((p) => p.bron))].some((id) => this.veldCacheHeeftVelden(id));
    const naamVeld = el('input', { type: 'text', class: 'veld', value: this.voorgesteldeNaam() });
    const vast = el('input', { type: 'checkbox' });
    const stand = el('select', { class: 'veld' },
      el('option', { value: '' }, 'Niet verkleinen'),
      el('option', { value: 'email' }, 'Verkleinen voor e-mail'),
      el('option', { value: 'scherm' }, 'Verkleinen voor scherm (kleinst)'),
      el('option', { value: 'druk' }, 'Verkleinen voor drukwerk (300 dpi)'));
    const kanOverschrijven = !!(bron && bron.handle && bron.handle.createWritable);
    const inhoud = el('div', {},
      el('label', { class: 'label' }, 'Bestandsnaam', naamVeld),
      heeftVelden && bron ? el('label', { class: 'vinklabel' }, vast, 'Formulier vastzetten (invulvelden worden gewone tekst)') : null,
      heeftVelden && !bron ? el('p', { class: 'klein' }, 'Omdat je meerdere documenten hebt samengevoegd, worden ingevulde formulieren vastgezet.') : null,
      el('label', { class: 'label' }, 'Grootte', stand),
      el('p', { class: 'klein' }, kanOverschrijven
        ? 'Standaard bewaar je een nieuw bestand naast het origineel. Het origineel blijft dan onaangeroerd.'
        : 'Je bewaart een nieuw bestand; het origineel blijft onaangeroerd.'));
    const naamWaarde = () => {
      let n = naamVeld.value.trim() || this.voorgesteldeNaam();
      if (!/\.pdf$/i.test(n)) n += '.pdf';
      return n;
    };
    const knoppen = [{ label: 'Annuleren', waarde: null }];
    if (kanOverschrijven) knoppen.push({ label: 'Origineel overschrijven', waarde: 'overschrijven' });
    knoppen.push({ label: 'Opslaan als nieuw bestand', waarde: 'nieuw', primair: true });
    const keuze = await dialoog({ titel: 'Opslaan', inhoud, knoppen });
    if (!keuze) return;
    if (keuze === 'overschrijven' && !(await bevestig('Origineel overschrijven?', `"${bron.naam}" wordt vervangen door de bewerkte versie. Dat kun je niet ongedaan maken.`, 'Overschrijven', true))) return;

    const b = bezig('PDF maken…');
    try {
      let data = await this.bouw({ vastzetten: vast.checked });
      if (stand.value) {
        b.tekst('Verkleinen…');
        const { blob, headers } = await api(`/api/verkleinen?stand=${stand.value}`, new Blob([data], { type: 'application/pdf' }), 'document.pdf');
        data = new Uint8Array(await blob.arrayBuffer());
        const voor = Number(headers.get('X-Grootte-Voor'));
        melding(`Verkleind van ${grootte(voor)} naar ${grootte(data.length)}.`, 'goed');
      }
      b.klaar();
      if (keuze === 'overschrijven') {
        await overschrijf(bron.handle, data);
        melding(`"${bron.naam}" is overschreven.`, 'goed');
      } else {
        const naam = await bewaar(data, naamWaarde(), { naast: bron && bron.handle });
        if (!naam) return;
        melding(`Opgeslagen als "${naam}".`, 'goed');
      }
      this.gewijzigd = false;
      this.bewaarConceptStraks();
    } catch (err) {
      b.klaar();
      console.error(err);
      melding(err.message || 'Opslaan is mislukt.', 'fout', 8000);
    }
  }

  veldCacheHeeftVelden(bronId) {
    for (const [k, v] of this.veldCache) if (k.startsWith(`${bronId}:`) && v.lijst.length) return true;
    return !!(this.staat.formulier[bronId] && Object.keys(this.staat.formulier[bronId]).length);
  }

  async uitnemen() {
    const doel = this.doelPaginas();
    if (!doel.length) return;
    const nummers = doel.map((id) => this.staat.paginas.findIndex((p) => p.id === id) + 1);
    const label = nummers.length === 1 ? `pagina ${nummers[0]}` : `pagina's ${nummers.join(', ')}`;
    const b = bezig('PDF maken…');
    try {
      const data = await this.bouw({ vastzetten: true }, doel);
      b.klaar();
      const naam = await bewaar(data, `${this.naam} – ${label}.pdf`.slice(0, 180), { naast: this.enkeleBron() && this.enkeleBron().handle });
      if (naam) melding(`${label[0].toUpperCase()}${label.slice(1)} opgeslagen als "${naam}".`, 'goed');
    } catch (err) {
      b.klaar();
      melding(err.message, 'fout');
    }
  }

  async alsWord() {
    const b = bezig('PDF maken…');
    try {
      const data = await this.bouw({ vastzetten: true });
      b.tekst('Omzetten naar Word… dit kan even duren');
      const { blob } = await api('/api/pdf-naar-word', new Blob([data], { type: 'application/pdf' }), `${this.naam}.pdf`);
      b.klaar();
      const naam = await bewaar(blob, `${this.naam}.docx`, { naast: this.enkeleBron() && this.enkeleBron().handle });
      if (naam) melding(`Opgeslagen als "${naam}". Controleer de opmaak even in Word.`, 'goed', 7000);
    } catch (err) {
      b.klaar();
      melding(err.message, 'fout', 8000);
    }
  }

  async alsAfbeeldingen() {
    const doel = this.doelPaginas();
    const alles = this.staat.paginas.map((p) => p.id);
    const bereik = el('select', { class: 'veld' },
      el('option', { value: 'alles' }, `Alle pagina's (${alles.length})`),
      doel.length && doel.length < alles.length ? el('option', { value: 'gekozen', selected: true }, `Gekozen pagina's (${doel.length})`) : null);
    const soort = el('select', { class: 'veld' }, el('option', { value: 'png' }, 'PNG (scherp, groter)'), el('option', { value: 'jpg' }, 'JPG (kleiner)'));
    const dpi = el('select', { class: 'veld' }, el('option', { value: '150' }, '150 dpi (scherm)'), el('option', { value: '300' }, '300 dpi (afdrukken)'));
    const ok = await dialoog({
      titel: 'Pagina\'s als afbeelding',
      inhoud: el('div', {}, el('label', { class: 'label' }, 'Welke pagina\'s', bereik), el('label', { class: 'label' }, 'Soort', soort), el('label', { class: 'label' }, 'Scherpte', dpi)),
      knoppen: [{ label: 'Annuleren', waarde: null }, { label: 'Opslaan', waarde: true, primair: true }],
    });
    if (!ok) return;
    const ids = bereik.value === 'gekozen' ? doel : alles;
    const b = bezig('Afbeeldingen maken…');
    try {
      const data = await this.bouw({ vastzetten: true }, ids);
      const bestanden = await pdfNaarAfbeeldingen(data, soort.value, Number(dpi.value), this.naam, (i, n) => b.tekst(`Pagina ${i} van ${n}…`));
      b.klaar();
      const uit = bestanden.length === 1
        ? await bewaar(bestanden[0].data, bestanden[0].naam)
        : await bewaarMeerdere(bestanden, `${this.naam} – afbeeldingen.zip`);
      if (uit) melding(`Opgeslagen: ${uit}.`, 'goed');
    } catch (err) {
      b.klaar();
      melding(err.message, 'fout');
    }
  }

  async doorzoekbaarMaken() {
    const ok = await bevestig('Doorzoekbaar maken',
      'Bladwerk herkent de tekst in gescande pagina\'s (Nederlands, Duits en Engels). Daarvoor gaat het document even naar je eigen server en wordt daar direct gewist. Je aantekeningen worden daarbij vast onderdeel van de pagina\'s.',
      'Doorzoekbaar maken');
    if (!ok) return;
    const b = bezig('PDF maken…');
    try {
      const data = await this.bouw({ vastzetten: true });
      b.tekst('Tekst herkennen… dit kan bij veel pagina\'s een paar minuten duren');
      const { blob } = await api('/api/doorzoekbaar', new Blob([data], { type: 'application/pdf' }), `${this.naam}.pdf`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      b.tekst('Openen…');
      const bron = await this.voegBronToe(bytes, `${this.naam} (doorzoekbaar).pdf`, null);
      this.staat = {
        paginas: bron.info.map((_, i) => ({ id: nieuwId('p'), bron: bron.id, index: i, draai: 0 })),
        aantekeningen: {},
        formulier: {},
      };
      this.paginaKeuze.clear();
      this.gekozen = null;
      this.vastleggen();
      b.klaar();
      this.herteken();
      melding('De tekst is herkend. Je kunt nu zoeken, kopiëren en de tekst corrigeren. Vergeet niet op te slaan.', 'goed', 8000);
    } catch (err) {
      b.klaar();
      melding(err.message, 'fout', 8000);
    }
  }

  /* ================= Zoom en toetsen ================= */
  zoomen(factor) {
    this.stopBewerken();
    this.zoom = Math.max(0.3, Math.min(4, this.zoom * factor));
    clearTimeout(this._zoomTimer);
    this.zoomLabel.textContent = `${Math.round((this.zoom / PX_PER_PT) * 100)}%`;
    this._zoomTimer = setTimeout(() => this.bouwPaginas(), 60);
  }

  passend() {
    if (!this.staat.paginas.length) return;
    const beschikbaar = Math.max(200, this.vlak.clientWidth - 56);
    const breedste = Math.max(...this.staat.paginas.slice(0, 60).map((p) => this.maat(p).w));
    this.zoom = Math.max(0.3, Math.min(2.5, beschikbaar / breedste));
    this.herteken();
  }

  toets(e) {
    if (this.root.hidden || document.querySelector('.venster-laag')) return;
    const inVeld = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 's') { e.preventDefault(); this.opslaan(); return; }
    if (inVeld) return;
    if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.opnieuw(); else this.ongedaan(); return; }
    if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); this.opnieuw(); return; }
    if (e.key === 'Escape') {
      if (this.gereedschap !== 'kiezen') { this.gereedschap = 'kiezen'; this.werkGereedschapBij(); } else this.kies(null);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.gekozen) { e.preventDefault(); this.verwijderGekozen(); return; }
    if (this.gekozen && e.key.startsWith('Arrow')) {
      const a = this.gekozenAnn();
      if (!a) return;
      e.preventDefault();
      const stap = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') a.x -= stap;
      if (e.key === 'ArrowRight') a.x += stap;
      if (e.key === 'ArrowUp') a.y -= stap;
      if (e.key === 'ArrowDown') a.y += stap;
      this.tekenLaag(this.gekozen.pid);
      clearTimeout(this._pijlTimer);
      this._pijlTimer = setTimeout(() => this.vastleggen(), 400);
      return;
    }
    if (!cmd && !e.altKey) {
      const sneltoetsen = { t: 'tekst', h: 'handtekening', v: 'vinkje', x: 'kruisje', m: 'markeren', s: 'stempel', c: 'corrigeren' };
      const t = sneltoetsen[e.key.toLowerCase()];
      if (t) { e.preventDefault(); this.kiesGereedschap(t); }
    }
  }

  async sluiten() {
    this.stopBewerken();
    if (this.gewijzigd && !(await bevestig('Document sluiten', 'Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je het document toch sluiten? De wijzigingen gaan dan verloren.', 'Sluiten zonder opslaan', true))) return;
    this.opruimen();
    await concept.wisConcept();
    this.opSluiten();
  }

  opruimen() {
    document.removeEventListener('keydown', this._toetsen);
    window.removeEventListener('beforeunload', this._voorVertrek);
    clearTimeout(this._conceptTimer);
    if (this.observer) this.observer.disconnect();
    if (this.miniObserver) this.miniObserver.disconnect();
    for (const b of this.bronnen.values()) { try { b.pdf.destroy(); } catch (_) { /* niets */ } }
    this.bronnen.clear();
    this.root.innerHTML = '';
    this.root.hidden = true;
  }
}

/* Bestanden uit een sleepactie, met bestandshandvat waar de browser dat geeft. */
export async function bestandenUitSlepen(dt) {
  const uit = [];
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file');
  if (items.length && items[0].getAsFileSystemHandle) {
    const handles = await Promise.all(items.map((i) => i.getAsFileSystemHandle().catch(() => null)));
    for (let k = 0; k < items.length; k++) {
      const h = handles[k];
      if (h && h.kind === 'file') uit.push({ bestand: await h.getFile(), handle: h });
      else { const f = items[k].getAsFile(); if (f) uit.push({ bestand: f, handle: null }); }
    }
    return uit;
  }
  for (const f of dt.files) uit.push({ bestand: f, handle: null });
  return uit;
}

/* Rendert elke pagina van een PDF als PNG of JPG. */
export async function pdfNaarAfbeeldingen(bytes, soort, dpi, naam, voortgang) {
  const pdf = await openPdfjs(bytes);
  const uit = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      if (voortgang) voortgang(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: dpi / 72 });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((r) => c.toBlob(r, soort === 'jpg' ? 'image/jpeg' : 'image/png', 0.9));
      const nr = String(i).padStart(String(pdf.numPages).length, '0');
      uit.push({ naam: `${naam} – pagina ${nr}.${soort}`, data: blob });
      c.width = 0; c.height = 0;
    }
  } finally {
    pdf.destroy();
  }
  return uit;
}
