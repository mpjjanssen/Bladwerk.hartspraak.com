'use strict';

/*
 * Bladwerk — eigen PDF-hulpmiddel van Hartspraak.
 *
 * De server doet drie dingen:
 *  1. Toegang afschermen met één wachtwoord (ondertekend sessiecookie).
 *  2. De webpagina en de bibliotheken serveren.
 *  3. Alleen voor omzetten, verkleinen, doorzoekbaar maken en ontgrendelen
 *     een bestand verwerken. Elk bestand krijgt een eigen tijdelijke map
 *     die direct na afloop wordt gewist, ook bij een fout.
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;
const MAX_UPLOAD_MB = 300;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_PARALLEL_JOBS = 2;

/*
 * Gebruikers: BLADWERK_GEBRUIKERS="Martien=wachtwoord1;Verena=wachtwoord2;…".
 * Wie uit de lijst verdwijnt, of wiens wachtwoord verandert, is meteen
 * uitgelogd. BLADWERK_PASSWORD geldt nog als wachtwoord van Martien.
 */
function leesGebruikers() {
  const lijst = new Map();
  for (const deel of String(process.env.BLADWERK_GEBRUIKERS || '').split(';')) {
    const i = deel.indexOf('=');
    if (i < 1) continue;
    const naam = deel.slice(0, i).trim();
    const wachtwoord = deel.slice(i + 1).trim();
    if (naam && wachtwoord) lijst.set(naam, wachtwoord);
  }
  if (process.env.BLADWERK_PASSWORD && !lijst.has('Martien')) lijst.set('Martien', process.env.BLADWERK_PASSWORD);
  return lijst;
}
const GEBRUIKERS = leesGebruikers();

if (!GEBRUIKERS.size || !SECRET) {
  console.error('BLADWERK_GEBRUIKERS (of BLADWERK_PASSWORD) en SESSION_SECRET moeten ingesteld zijn.');
  if (IS_PROD) process.exit(1);
}

/* Een korte vingerafdruk van het wachtwoord, zodat een nieuw wachtwoord oude sessies ongeldig maakt. */
const vingerafdruk = (wachtwoord) => crypto.createHmac('sha256', SECRET).update(`pw:${wachtwoord}`).digest('base64url').slice(0, 12);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ---------- Beveiligingskoppen ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});


/* ---------- Foutmeldingen in de taal van de app (kop X-Taal) ---------- */
const MELDINGEN = {
  en: {
    'Je bent niet (meer) ingelogd.': 'You are not logged in (any more).',
    'Er is geen bestand meegestuurd.': 'No file was sent.',
    'Het verwerken is mislukt. Probeer het nog eens, of met een ander bestand.': 'Processing failed. Try again, or with a different file.',
    'Het bestand kon niet worden ontvangen.': 'The file could not be received.',
    'Pages-bestanden kan ik niet omzetten. Exporteer het in Pages eerst als Word-bestand.': 'Pages files can\'t be converted. Export it from Pages as a Word file first.',
    'Dit is geen PDF-bestand.': 'This is not a PDF file.',
    'Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.': 'This PDF is password-protected. Open it in the workspace first to unlock it.',
    'Deze PDF heeft al doorzoekbare tekst.': 'This PDF already has searchable text.',
    'Dat wachtwoord klopt niet.': 'That password is incorrect.',
    'Te veel pogingen. Wacht een kwartier en probeer het dan opnieuw.': 'Too many attempts. Wait fifteen minutes and try again.',
    'Onbekende opdracht.': 'Unknown request.',
    [`Het bestand is groter dan ${MAX_UPLOAD_MB} MB.`]: `The file is larger than ${MAX_UPLOAD_MB} MB.`,
  },
  de: {
    'Je bent niet (meer) ingelogd.': 'Du bist nicht (mehr) angemeldet.',
    'Er is geen bestand meegestuurd.': 'Es wurde keine Datei mitgeschickt.',
    'Het verwerken is mislukt. Probeer het nog eens, of met een ander bestand.': 'Die Verarbeitung ist fehlgeschlagen. Versuche es noch einmal oder mit einer anderen Datei.',
    'Het bestand kon niet worden ontvangen.': 'Die Datei konnte nicht empfangen werden.',
    'Pages-bestanden kan ik niet omzetten. Exporteer het in Pages eerst als Word-bestand.': 'Pages-Dateien können nicht umgewandelt werden. Exportiere sie in Pages zuerst als Word-Datei.',
    'Dit is geen PDF-bestand.': 'Das ist keine PDF-Datei.',
    'Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.': 'Diese PDF ist mit einem Passwort geschützt. Öffne sie zuerst im Arbeitsbereich, um sie zu entsperren.',
    'Deze PDF heeft al doorzoekbare tekst.': 'Diese PDF enthält bereits durchsuchbaren Text.',
    'Dat wachtwoord klopt niet.': 'Das Passwort ist falsch.',
    'Te veel pogingen. Wacht een kwartier en probeer het dan opnieuw.': 'Zu viele Versuche. Warte eine Viertelstunde und versuche es dann erneut.',
    'Onbekende opdracht.': 'Unbekannte Anfrage.',
    [`Het bestand is groter dan ${MAX_UPLOAD_MB} MB.`]: `Die Datei ist größer als ${MAX_UPLOAD_MB} MB.`,
  },
};
app.use((req, res, next) => {
  const taal = String(req.get('x-taal') || '').slice(0, 2);
  if (!MELDINGEN[taal]) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body.fout === 'string' && MELDINGEN[taal][body.fout]) body = { ...body, fout: MELDINGEN[taal][body.fout] };
    return json(body);
  };
  next();
});

/* ---------- Sessie ---------- */
function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function makeSession(naam) {
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const nonce = crypto.randomBytes(8).toString('base64url');
  const wie = Buffer.from(naam).toString('base64url');
  const payload = `${expires}.${nonce}.${wie}.${vingerafdruk(GEBRUIKERS.get(naam))}`;
  return `${payload}.${sign(payload)}`;
}

/* Geeft de naam van de ingelogde gebruiker terug, of null. */
function validSession(cookieValue) {
  if (!cookieValue || !SECRET) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 5) return null;
  const payload = parts.slice(0, 4).join('.');
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[4]);
  if (expected.length !== given.length) return null;
  if (!crypto.timingSafeEqual(expected, given)) return null;
  if (Number(parts[0]) <= Date.now()) return null;
  let naam;
  try { naam = Buffer.from(parts[2], 'base64url').toString('utf8'); } catch (_) { return null; }
  if (!GEBRUIKERS.has(naam) || vingerafdruk(GEBRUIKERS.get(naam)) !== parts[3]) return null;
  return naam;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/* Zoekt bij welke gebruiker het wachtwoord hoort (in constante tijd per gebruiker). */
function gebruikerBijWachtwoord(given) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  let gevonden = null;
  for (const [naam, wachtwoord] of GEBRUIKERS) {
    const b = crypto.createHash('sha256').update(wachtwoord).digest();
    if (crypto.timingSafeEqual(a, b) && !gevonden) gevonden = naam;
  }
  return gevonden;
}

/* Eenvoudige rem op raden: 8 pogingen per 15 minuten per adres. */
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 8;
}
function recordAttempt(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

const PUBLIC_DIR = path.join(__dirname, 'public');

/*
 * De app zelf (pagina, scripts, opmaak) is openbaar; daar staat niets
 * geheims in. Alleen de verwerking op de server (/api/) vraagt een sessie.
 * Zo kan de geïnstalleerde app een aangeklikt bestand vasthouden terwijl
 * je inlogt.
 */
const wilJson = (req) => (req.get('accept') || '').includes('application/json');

app.get('/inloggen', (req, res) => res.redirect('/'));

app.post('/inloggen', express.urlencoded({ extended: false, limit: '10kb' }), (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return wilJson(req)
      ? res.status(429).json({ fout: 'Te veel pogingen. Wacht een kwartier en probeer het dan opnieuw.' })
      : res.redirect('/?fout=wacht');
  }
  const naam = gebruikerBijWachtwoord(req.body && req.body.wachtwoord);
  if (!naam) {
    recordAttempt(ip);
    return wilJson(req) ? res.status(401).json({ fout: 'Dat wachtwoord klopt niet.' }) : res.redirect('/?fout=wachtwoord');
  }
  attempts.delete(ip);
  res.setHeader(
    'Set-Cookie',
    `bw_sessie=${encodeURIComponent(makeSession(naam))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${IS_PROD ? '; Secure' : ''}`
  );
  return wilJson(req) ? res.json({ ok: true }) : res.redirect('/');
});

app.post('/uitloggen', (req, res) => {
  res.setHeader('Set-Cookie', `bw_sessie=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PROD ? '; Secure' : ''}`);
  res.redirect('/');
});

app.get('/gezond', (req, res) => res.type('text').send('ok'));

app.use('/api/', (req, res, next) => {
  const naam = validSession(readCookie(req, 'bw_sessie'));
  if (naam) { req.gebruiker = naam; return next(); }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(401).json({ fout: 'Je bent niet (meer) ingelogd.' });
});

app.get('/api/sessie', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ingelogd: true, naam: req.gebruiker });
});

/* ---------- Statische bestanden ---------- */
const nm = (p) => path.join(__dirname, 'node_modules', p);
const vendorOpts = { maxAge: '30d', immutable: true };
app.use('/vendor/pdfjs', express.static(nm('pdfjs-dist/build'), vendorOpts));
app.use('/vendor/pdfjs/cmaps', express.static(nm('pdfjs-dist/cmaps'), vendorOpts));
app.use('/vendor/pdfjs/standard_fonts', express.static(nm('pdfjs-dist/standard_fonts'), vendorOpts));
app.use('/vendor/pdf-lib', express.static(nm('pdf-lib/dist'), vendorOpts));
app.use('/vendor/fontkit', express.static(nm('@pdf-lib/fontkit/dist'), vendorOpts));
app.use('/vendor/jszip', express.static(nm('jszip/dist'), vendorOpts));
app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',
  maxAge: 0,
  setHeaders: (res, file) => {
    if (file.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

/* ---------- Verwerking op de server ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

let running = 0;
const waiting = [];
function acquire() {
  if (running < MAX_PARALLEL_JOBS) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve)).then(() => { running++; });
}
function release() {
  running--;
  const next = waiting.shift();
  if (next) next();
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => { if (stdout.length < 20000) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < 20000) stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, opts.timeout || JOB_TIMEOUT_MS);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(`${cmd} stopte met code ${code}${signal ? ' (' + signal + ')' : ''}`);
        err.stderr = stderr;
        err.stdout = stdout;
        err.code = code;
        reject(err);
      }
    });
  });
}

class UserError extends Error {}

/*
 * Voert een klus uit in een eigen tijdelijke map. De map wordt altijd
 * gewist, of het nu lukt of niet.
 */
async function withJob(req, res, handler) {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ fout: 'Er is geen bestand meegestuurd.' });
  }
  await acquire();
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bladwerk-'));
  try {
    const result = await handler(dir, req.file.buffer);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', result.type);
    if (result.headers) for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
    res.send(result.data);
  } catch (err) {
    if (err instanceof UserError) {
      res.status(422).json({ fout: err.message });
    } else {
      console.error('Klus mislukt:', err.message, (err.stderr || '').slice(0, 2000));
      res.status(500).json({ fout: 'Het verwerken is mislukt. Probeer het nog eens, of met een ander bestand.' });
    }
  } finally {
    release();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (req.file) req.file.buffer = null;
  }
}

function isPdf(buf) {
  return buf.length > 5 && buf.slice(0, 1024).includes(Buffer.from('%PDF-'));
}


/*
 * Beveiligde PDF's: alleen-beperkingen (geen wachtwoord nodig om te openen)
 * halen we stil weg; vraagt het bestand een wachtwoord, dan melden we dat.
 */
async function ontsleutelIndienNodig(dir, input) {
  let versleuteld = false;
  try { await run('qpdf', ['--is-encrypted', input], { timeout: 60000 }); versleuteld = true; } catch (_) { versleuteld = false; }
  if (!versleuteld) return input;
  let wachtwoordNodig = false;
  try { await run('qpdf', ['--requires-password', input], { timeout: 60000 }); wachtwoordNodig = true; } catch (_) { wachtwoordNodig = false; }
  if (wachtwoordNodig) {
    throw new UserError('Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.');
  }
  const out = path.join(dir, 'ontsleuteld.pdf');
  try {
    await run('qpdf', ['--decrypt', input, out], { timeout: 2 * 60 * 1000 });
  } catch (err) {
    if (!(err.code === 3 && fs.existsSync(out))) throw err;
  }
  return out;
}

const singleFile = (req, res, next) =>
  upload.single('bestand')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ fout: `Het bestand is groter dan ${MAX_UPLOAD_MB} MB.` });
    }
    return res.status(400).json({ fout: 'Het bestand kon niet worden ontvangen.' });
  });

/* Word (en andere tekstbestanden) naar PDF via LibreOffice */
const WORD_EXT = ['.doc', '.docx', '.odt', '.rtf', '.txt', '.pages'];
app.post('/api/word-naar-pdf', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    let ext = path.extname(req.file.originalname || '').toLowerCase();
    if (ext === '.pages') throw new UserError('Pages-bestanden kan ik niet omzetten. Exporteer het in Pages eerst als Word-bestand.');
    if (!WORD_EXT.includes(ext)) ext = '.docx';
    const input = path.join(dir, 'invoer' + ext);
    await fsp.writeFile(input, buf);
    const profile = path.join(dir, 'lo-profiel');
    await run('soffice', [
      `-env:UserInstallation=file://${profile}`,
      '--headless', '--norestore', '--nologo',
      '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', dir, input,
    ], { timeout: 5 * 60 * 1000, env: { ...process.env, HOME: dir } });
    const out = path.join(dir, 'invoer.pdf');
    if (!fs.existsSync(out)) throw new Error('LibreOffice maakte geen PDF');
    return { type: 'application/pdf', data: await fsp.readFile(out) };
  })
);

/* PDF naar Word via pdf2docx */
app.post('/api/pdf-naar-word', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    if (!isPdf(buf)) throw new UserError('Dit is geen PDF-bestand.');
    const input = path.join(dir, 'invoer.pdf');
    const output = path.join(dir, 'uitvoer.docx');
    await fsp.writeFile(input, buf);
    const bron = await ontsleutelIndienNodig(dir, input);
    try {
      await run('python3', [path.join(__dirname, 'scripts', 'pdf_naar_word.py'), bron, output], {
        timeout: 10 * 60 * 1000,
      });
    } catch (err) {
      if ((err.stderr || '').includes('VERSLEUTELD')) {
        throw new UserError('Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.');
      }
      throw err;
    }
    return {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: await fsp.readFile(output),
    };
  })
);

/* Verkleinen met Ghostscript, in drie standen */
const STANDEN = {
  email: { preset: '/ebook', dpi: 150 },
  scherm: { preset: '/screen', dpi: 110 },
  druk: { preset: '/printer', dpi: 300 },
};
app.post('/api/verkleinen', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    if (!isPdf(buf)) throw new UserError('Dit is geen PDF-bestand.');
    const stand = STANDEN[req.query.stand] ? req.query.stand : 'email';
    const { preset, dpi } = STANDEN[stand];
    const input = path.join(dir, 'invoer.pdf');
    const output = path.join(dir, 'uitvoer.pdf');
    await fsp.writeFile(input, buf);
    const bron = await ontsleutelIndienNodig(dir, input);
    const args = [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', `-dPDFSETTINGS=${preset}`,
      '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dSAFER',
      '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true',
      '-dAutoRotatePages=/None',
      '-dDownsampleColorImages=true', '-dDownsampleGrayImages=true', '-dDownsampleMonoImages=true',
      `-dColorImageResolution=${dpi}`, `-dGrayImageResolution=${dpi}`,
      `-dMonoImageResolution=${Math.max(dpi * 2, 300)}`,
      '-dColorImageDownsampleThreshold=1.2', '-dGrayImageDownsampleThreshold=1.2',
    ];
    if (stand !== 'druk') args.push('-sColorConversionStrategy=RGB');
    args.push(`-sOutputFile=${output}`, bron);
    try {
      await run('gs', args, { timeout: 10 * 60 * 1000 });
    } catch (err) {
      if (/password/i.test(err.stderr || '') || /password/i.test(err.stdout || '')) {
        throw new UserError('Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.');
      }
      throw err;
    }
    let data = await fsp.readFile(output);
    let kept = false;
    if (data.length >= buf.length) {
      data = buf;
      kept = true;
    }
    return {
      type: 'application/pdf',
      data,
      headers: {
        'X-Grootte-Voor': String(buf.length),
        'X-Grootte-Na': String(data.length),
        'X-Origineel-Behouden': kept ? '1' : '0',
      },
    };
  })
);

/* Scan doorzoekbaar maken met ocrmypdf (Nederlands, Duits, Engels) */
app.post('/api/doorzoekbaar', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    if (!isPdf(buf)) throw new UserError('Dit is geen PDF-bestand.');
    const input = path.join(dir, 'invoer.pdf');
    const output = path.join(dir, 'uitvoer.pdf');
    await fsp.writeFile(input, buf);
    const bron = await ontsleutelIndienNodig(dir, input);
    try {
      await run('ocrmypdf', [
        '-l', 'nld+deu+eng',
        '--skip-text', '--rotate-pages', '--deskew',
        '--output-type', 'pdf', '--optimize', '1',
        '--jobs', '2', '--quiet',
        bron, output,
      ], { timeout: 15 * 60 * 1000, env: { ...process.env, HOME: dir, TMPDIR: dir } });
    } catch (err) {
      const msg = (err.stderr || '') + (err.stdout || '');
      if (err.code === 8 || /encrypted/i.test(msg)) {
        throw new UserError('Deze PDF is beveiligd met een wachtwoord. Open hem eerst in de werkruimte om hem te ontgrendelen.');
      }
      if (err.code === 6) {
        throw new UserError('Deze PDF heeft al doorzoekbare tekst.');
      }
      throw err;
    }
    return { type: 'application/pdf', data: await fsp.readFile(output) };
  })
);

/* Beveiligde PDF ontgrendelen met qpdf (wachtwoord van de gebruiker) */
app.post('/api/ontgrendelen', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    if (!isPdf(buf)) throw new UserError('Dit is geen PDF-bestand.');
    const input = path.join(dir, 'invoer.pdf');
    const output = path.join(dir, 'uitvoer.pdf');
    await fsp.writeFile(input, buf);
    const pw = String((req.body && req.body.wachtwoord) || '');
    const pwFile = path.join(dir, 'pw.txt');
    await fsp.writeFile(pwFile, pw, { mode: 0o600 });
    try {
      await run('qpdf', [`--password-file=${pwFile}`, '--decrypt', input, output], { timeout: 2 * 60 * 1000 });
    } catch (err) {
      // qpdf geeft code 3 bij waarschuwingen; het resultaat is dan toch bruikbaar.
      if (err.code === 3 && fs.existsSync(output)) {
        return { type: 'application/pdf', data: await fsp.readFile(output) };
      }
      if (/invalid password/i.test(err.stderr || '')) {
        throw new UserError(pw ? 'Dat wachtwoord klopt niet.' : 'WACHTWOORD_NODIG');
      }
      throw err;
    }
    return { type: 'application/pdf', data: await fsp.readFile(output) };
  })
);

/* Foto van iPhone (HEIC) omzetten naar JPG, zodat de browser hem kan lezen */
app.post('/api/foto-naar-jpg', singleFile, (req, res) =>
  withJob(req, res, async (dir, buf) => {
    const input = path.join(dir, 'invoer.heic');
    const output = path.join(dir, 'uitvoer.jpg');
    await fsp.writeFile(input, buf);
    await run('heif-convert', ['-q', '90', input, output], { timeout: 2 * 60 * 1000 });
    let out = output;
    if (!fs.existsSync(out)) {
      // Bij bestanden met meerdere beelden nummert heif-convert de uitvoer.
      const files = (await fsp.readdir(dir)).filter((f) => f.startsWith('uitvoer') && f.endsWith('.jpg')).sort();
      if (!files.length) throw new Error('Geen JPG gemaakt');
      out = path.join(dir, files[0]);
    }
    return { type: 'image/jpeg', data: await fsp.readFile(out) };
  })
);

app.use('/api', (req, res) => res.status(404).json({ fout: 'Onbekende opdracht.' }));

/* Opruimen van mappen die een eventuele crash hebben overleefd */
async function cleanupStale() {
  try {
    const tmp = os.tmpdir();
    for (const name of await fsp.readdir(tmp)) {
      if (!name.startsWith('bladwerk-')) continue;
      const p = path.join(tmp, name);
      const st = await fsp.stat(p).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 30 * 60 * 1000) await fsp.rm(p, { recursive: true, force: true });
    }
  } catch (_) { /* niets */ }
}
cleanupStale();
setInterval(cleanupStale, 15 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`Bladwerk draait op poort ${PORT}`));
