/*
 * Tussentijds bewaren in de browser (IndexedDB), zodat je verder kunt
 * als het venster onverwacht sluit. Alles blijft op deze computer.
 * De bronbestanden worden één keer weggeschreven, de stand van het werk
 * bij elke wijziging.
 */
const DB = 'bladwerk';
const VERSIE = 1;

function open() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, VERSIE); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bronnen')) db.createObjectStore('bronnen');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function klus(stores, modus, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, modus);
    let uitkomst;
    Promise.resolve(fn(tx)).then((u) => { uitkomst = u; });
    tx.oncomplete = () => { db.close(); resolve(uitkomst); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

const verzoek = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function bewaarBron(id, bron) {
  try {
    await klus(['bronnen'], 'readwrite', (tx) => {
      const rec = { naam: bron.naam, bytes: bron.bytes };
      try {
        tx.objectStore('bronnen').put({ ...rec, handle: bron.handle || null }, id);
      } catch (_) {
        tx.objectStore('bronnen').put(rec, id);
      }
    });
  } catch (e) { console.warn('Tussentijds bewaren (bron) lukte niet', e); }
}

export async function bewaarStand(meta) {
  try {
    await klus(['meta'], 'readwrite', (tx) => { tx.objectStore('meta').put(meta, 'huidig'); });
  } catch (e) { console.warn('Tussentijds bewaren lukte niet', e); }
}

export async function laadConcept() {
  try {
    return await klus(['bronnen', 'meta'], 'readonly', async (tx) => {
      const meta = await verzoek(tx.objectStore('meta').get('huidig'));
      if (!meta || !meta.staat || !meta.staat.paginas || !meta.staat.paginas.length) return null;
      const bronnen = {};
      for (const id of meta.bronIds || []) {
        const b = await verzoek(tx.objectStore('bronnen').get(id));
        if (!b) return null;
        bronnen[id] = b;
      }
      return { ...meta, bronnen };
    });
  } catch (e) {
    console.warn('Concept laden lukte niet', e);
    return null;
  }
}

export async function wisConcept() {
  try {
    await klus(['bronnen', 'meta'], 'readwrite', (tx) => {
      tx.objectStore('bronnen').clear();
      tx.objectStore('meta').clear();
    });
  } catch (e) { console.warn('Concept wissen lukte niet', e); }
}
