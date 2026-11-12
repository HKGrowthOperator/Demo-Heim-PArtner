// Demo, Angebote und Online-Vertrag für Heim & Partner.
// Liefert site/ aus (wie zuvor nginx) und nimmt Unterschriften für den Vertrag entgegen:
// Vertrag und Anzahlungsrechnung als PDF, Ablage auf dem Volume, Versand per E-Mail.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { berechne, bereinigeAuswahl } from './preis.mjs'
import { speicher } from './speicher.mjs'
import { pdf, schliessen } from './pdf.mjs'
import { senden, mailKonfiguriert, gueltigeMail } from './mail.mjs'
import { vertragHtml, vertragsinhalt, rechnungHtml, mailInhalt, hkSteuer, sha256, datum, uhrzeit, esc, unterschriften, HK_VORAB } from './dokumente.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.resolve(process.env.SITE_DIR || path.join(HIER, '..', 'site'))
const KAT = JSON.parse(fs.readFileSync(path.join(HIER, 'vorlage', 'katalog.json'), 'utf8'))
const PORT = Number(process.env.PORT || 80)
const ablage = speicher(process.env.DATA_DIR || '/data')
const KOPIE_AN = (process.env.MAIL_COPY_TO || KAT.hk.mail).split(',').map(s => s.trim()).filter(Boolean)

// ── Hilfen ───────────────────────────────────────────────────
const HEADER = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}
const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.woff2': 'font/woff2' }

function senden_(res, status, body, typ = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  res.writeHead(status, { ...HEADER, 'Content-Type': typ, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra })
  res.end(res.req.method === 'HEAD' ? undefined : buf)
}
const json = (res, status, obj) => senden_(res, status, obj)

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || req.socket.remoteAddress || ''
}

function passwortOk(req) {
  const u = process.env.BASIC_AUTH_USER, p = process.env.BASIC_AUTH_PASSWORD
  if (!u || !p) return true
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '')
  if (!m) return false
  const soll = Buffer.from(`${u}:${p}`), ist = Buffer.from(Buffer.from(m[1], 'base64').toString())
  return soll.length === ist.length && crypto.timingSafeEqual(soll, ist)
}

async function lies(req, max = 2_000_000) {
  const teile = []; let n = 0
  for await (const t of req) { n += t.length; if (n > max) throw Object.assign(new Error('Anfrage zu groß'), { status: 413 }); teile.push(t) }
  try { return JSON.parse(Buffer.concat(teile).toString('utf8') || '{}') } catch { throw Object.assign(new Error('Ungültige Anfrage'), { status: 400 }) }
}

const versuche = new Map()
function begrenzt(ip, art, max) {
  const k = art + ':' + ip, jetzt = Date.now(), liste = (versuche.get(k) || []).filter(t => jetzt - t < 3600_000)
  if (liste.length >= max) return true
  liste.push(jetzt); versuche.set(k, liste); return false
}

const token = (id, datei) => crypto.createHmac('sha256', ablage.geheimnis()).update(`${id}/${datei}`).digest('hex').slice(0, 32)
const basisUrl = req => (process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`).replace(/\/$/, '')

function gueltigBis() {
  const s = process.env.OFFER_VALID_UNTIL || KAT.gueltig.split('.').reverse().join('-')
  return new Date(`${s}T23:59:59+01:00`)
}

// ── Static ───────────────────────────────────────────────────
function statisch(req, res, url) {
  let rel
  try { rel = decodeURIComponent(url.pathname) } catch { return senden_(res, 400, 'Bad Request', 'text/plain') }
  const ziel = path.resolve(SITE, '.' + rel)
  if (ziel !== SITE && !ziel.startsWith(SITE + path.sep)) return senden_(res, 404, 'Not Found', 'text/plain')
  let datei = ziel, st = fs.statSync(ziel, { throwIfNoEntry: false })
  if (st?.isDirectory()) {
    if (!rel.endsWith('/')) { res.writeHead(301, { ...HEADER, Location: url.pathname + '/' + url.search }); return res.end() }
    datei = path.join(ziel, 'index.html'); st = fs.statSync(datei, { throwIfNoEntry: false })
  }
  if (!st?.isFile()) return senden_(res, 404, 'Not Found', 'text/plain')
  const typ = TYPEN[path.extname(datei).toLowerCase()] || 'application/octet-stream'
  const cache = typ.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600'
  res.writeHead(200, { ...HEADER, 'Content-Type': typ, 'Content-Length': st.size, 'Cache-Control': cache })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(datei).pipe(res)
}

// ── Vertrag ──────────────────────────────────────────────────
const txt = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim().replace(/\s+/g, ' ') : null

function pruefe(b) {
  const f = []
  const signer = b.signer || {}
  const name = txt(signer.name, 3, 120), funktion = txt(signer.funktion, 2, 80), ort = txt(signer.ort, 2, 80)
  const email = gueltigeMail(signer.email) ? signer.email.trim() : null
  const gf = txt(b.gf, 3, 160), ansprechpartner = txt(b.ansprechpartner, 2, 120)
  const vertretung = b.vertretung ? txt(b.vertretung, 2, 120) : ''
  const rechnungEmail = b.rechnungEmail ? (gueltigeMail(b.rechnungEmail) ? b.rechnungEmail.trim() : false) : ''
  if (!name) f.push('Name der unterzeichnenden Person')
  if (!funktion) f.push('Funktion')
  if (!email) f.push('E-Mail-Adresse')
  if (!ort) f.push('Ort')
  if (!gf) f.push('Vertretungsberechtigte Geschäftsführer')
  if (!ansprechpartner) f.push('Ansprechpartner im Projekt')
  if (vertretung === null) f.push('Vertretung im Projekt')
  if (rechnungEmail === false) f.push('E-Mail für Rechnungen')
  if (b.vertretungsberechtigt !== true) f.push('Bestätigung der Vertretungsberechtigung')
  if (b.zustimmung !== true) f.push('Annahme des Vertrags')
  const sig = typeof b.signatur === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(b.signatur) : null
  const png = sig ? Buffer.from(sig[1], 'base64') : null
  if (!png || png.length < 800 || png.length > 600_000 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') f.push('Unterschrift')
  return { fehlt: f, daten: { name, funktion, email, ort, gf, ansprechpartner, vertretung: vertretung || '', rechnungEmail: rechnungEmail || '', png } }
}

let kette = Promise.resolve()
const nacheinander = fn => (kette = kette.then(fn, fn))

async function unterschreiben(req, res) {
  const ip = clientIp(req)
  const b = await lies(req)
  if (b.website) return json(res, 400, { ok: false, fehler: 'Ungültige Anfrage' })
  const nonce = typeof b.nonce === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.nonce) ? b.nonce : null
  if (!nonce) return json(res, 400, { ok: false, fehler: 'Ungültige Anfrage' })
  if (Date.now() > gueltigBis().getTime()) return json(res, 410, { ok: false, fehler: `Das Angebot war bis ${KAT.gueltig} gültig. Bitte meldet euch bei uns, wir schicken ein neues.` })
  const { fehlt, daten: d } = pruefe(b)
  if (fehlt.length) return json(res, 422, { ok: false, fehler: 'Bitte ergänzen: ' + fehlt.join(', '), fehlt })
  if (begrenzt(ip, 'sign', 5)) return json(res, 429, { ok: false, fehler: 'Zu viele Versuche. Bitte in einer Stunde erneut oder per E-Mail an ' + KAT.hk.mail })

  const ergebnis = await nacheinander(async () => {
    const vorhanden = ablage.nonce(nonce)
    if (vorhanden) return antwort(req, ablage.record(vorhanden))

    const auswahl = bereinigeAuswahl(KAT, b.addons)
    const c = berechne(KAT, auswahl)
    const jetzt = new Date(), jahr = Number(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(jetzt))
    const vnr = `HKG-V-${jahr}-${String(ablage.naechste('vertrag', jahr)).padStart(4, '0')}`
    const f = { gf: d.gf, ansprechpartner: d.ansprechpartner, vertretung: d.vertretung }
    const u = { name: d.name, funktion: d.funktion, ort: d.ort, datum: datum(jetzt), uhrzeit: uhrzeit(jetzt), signatur: 'data:image/png;base64,' + d.png.toString('base64') }
    const inhalt = vertragsinhalt(KAT, c, f, u)
    const protokoll = { vnr, name: d.name, funktion: d.funktion, email: d.email, ort: d.ort, datum: u.datum, uhrzeit: u.uhrzeit, iso: jetzt.toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 300), hash: sha256(inhalt) }
    const vertragPdf = await pdf(vertragHtml(KAT, c, f, { vnr, u, protokoll }).html, { fusszeile: `Vertrag ${vnr} · ${KAT.kunde.name} · ${KAT.hk.name}` })
    const pdfHash = sha256(vertragPdf)

    // Rechnung nur mit vollständigen Steuer- und Bankdaten (§ 14 UStG)
    const fehltRg = [!hkSteuer() && 'HK_USTID oder HK_STEUERNR', !process.env.HK_IBAN && 'HK_IBAN', !process.env.HK_BANK && 'HK_BANK'].filter(Boolean)
    let rechnung = null, rechnungPdf = null
    if (!fehltRg.length) {
      const start = Number(process.env.INVOICE_START || 1)
      const nr = `${process.env.INVOICE_PREFIX || 'HKG-RE-'}${jahr}-${String(ablage.naechste('rechnung', jahr, start)).padStart(4, '0')}`
      const faellig = datum(new Date(jetzt.getTime() + 14 * 86400_000))
      const rg = rechnungHtml(KAT, c, { nr, datum: u.datum, faellig, vnr })
      rechnungPdf = await pdf(rg.html, { fusszeile: `Rechnung ${nr} · ${KAT.hk.name}` })
      rechnung = { nr, faellig, brutto: rg.brutto, netto: rg.netto, ust: rg.ust }
    }

    const dateien = { 'vertrag.pdf': vertragPdf, 'signatur.png': d.png }
    if (rechnungPdf) dateien['rechnung.pdf'] = rechnungPdf
    const record = {
      vnr, angelegt: jetzt.toISOString(), nonce, auswahl, summe: { net: c.net, brutto: c.brutto, mon: c.mon, einmalAddons: c.einmal },
      posten: c.posten, angefragt: c.angefragt, unterzeichner: { name: d.name, funktion: d.funktion, email: d.email, ort: d.ort },
      gf: d.gf, ansprechpartner: d.ansprechpartner, vertretung: d.vertretung, rechnungEmail: d.rechnungEmail, protokoll, pdfHash,
      rechnung, rechnungFehlt: fehltRg, mail: { status: 'offen' },
    }
    ablage.ablegen(vnr, dateien, record)
    ablage.merkeNonce(nonce, vnr)

    // Versand
    const an = [...new Set([d.email, d.rechnungEmail].filter(Boolean))]
    const m = mailInhalt(KAT, c, { vnr, name: d.name, rechnung, pdfHash })
    const mail = {
      an, kopie: KOPIE_AN.filter(x => !an.includes(x)), antwortAn: KAT.hk.mail,
      betreff: `Vertrag ${vnr} unterschrieben${rechnung ? ` · Anzahlungsrechnung ${rechnung.nr}` : ''}`,
      html: m.html, text: m.text,
      anhaenge: [{ name: `Vertrag-${vnr}.pdf`, buf: vertragPdf }, ...(rechnungPdf ? [{ name: `Rechnung-${rechnung.nr}.pdf`, buf: rechnungPdf }] : [])],
    }
    let mailStatus
    if (mailKonfiguriert()) {
      try { mailStatus = { status: 'gesendet', id: await senden(mail), an, kopie: mail.kopie } }
      catch (e) { console.error('[vertrag] Versand fehlgeschlagen', vnr, e.message); ablage.postausgang({ ...mail, fehler: e.message }); mailStatus = { status: 'fehler', fehler: e.message, an } }
    } else {
      ablage.postausgang(mail); mailStatus = { status: 'postausgang', an }
    }
    if (fehltRg.length && mailKonfiguriert()) {
      senden({ an: KOPIE_AN, betreff: `Rechnung offen zu Vertrag ${vnr}`, text: `Vertrag ${vnr} ist unterschrieben, die Anzahlungsrechnung wurde nicht erstellt. In Coolify fehlen: ${fehltRg.join(', ')}. Bitte eintragen und die Rechnung manuell schicken.`, html: `<p>Vertrag ${esc(vnr)} ist unterschrieben, die Anzahlungsrechnung wurde nicht erstellt.</p><p>In Coolify fehlen: ${esc(fehltRg.join(', '))}. Bitte eintragen und die Rechnung manuell schicken.</p>` }).catch(e => console.error('[vertrag] Hinweis-Mail fehlgeschlagen', e.message))
    }
    ablage.nachtragen(vnr, { mail: mailStatus })
    console.log(`[vertrag] ${vnr} unterschrieben von ${d.name}, ${c.net} € netto, Rechnung ${rechnung?.nr || 'offen'}, Mail ${mailStatus.status}`)
    return antwort(req, ablage.record(vnr))
  })
  return json(res, 200, ergebnis)
}

function antwort(req, r) {
  const basis = basisUrl(req), link = datei => `${basis}/api/vertrag/dokument/${encodeURIComponent(r.vnr)}/${datei}?t=${token(r.vnr, datei)}`
  return {
    ok: true, vertragNr: r.vnr, summe: r.summe, unterzeichner: r.unterzeichner.name,
    rechnung: r.rechnung ? { nr: r.rechnung.nr, brutto: r.rechnung.brutto, faellig: r.rechnung.faellig } : null,
    mail: { status: r.mail.status, an: r.mail.an || [] },
    downloads: { vertrag: link('vertrag.pdf'), ...(r.rechnung ? { rechnung: link('rechnung.pdf') } : {}) },
  }
}

async function vorschau(req, res) {
  if (begrenzt(clientIp(req), 'vorschau', 40)) return json(res, 429, { ok: false, fehler: 'Zu viele Vorschauen, bitte später erneut.' })
  const b = await lies(req, 50_000)
  const c = berechne(KAT, bereinigeAuswahl(KAT, b.addons))
  const f = { gf: txt(b.gf, 1, 160) || '', ansprechpartner: txt(b.ansprechpartner, 1, 120) || '', vertretung: txt(b.vertretung, 1, 120) || '' }
  const buf = await pdf(vertragHtml(KAT, c, f, { vorschau: true }).html, { fusszeile: `Vorschau · Vertrag zum Angebot ${KAT.nr} · nicht unterschrieben` })
  senden_(res, 200, buf, 'application/pdf', { 'Content-Disposition': `inline; filename="Vertrag-Vorschau-${KAT.nr}.pdf"` })
}

function dokument(req, res, id, datei) {
  if (!/^HKG-V-\d{4}-\d{4}$/.test(id) || !['vertrag.pdf', 'rechnung.pdf'].includes(datei)) return json(res, 404, { ok: false })
  const t = new URL(req.url, 'http://x').searchParams.get('t') || ''
  const soll = token(id, datei)
  if (t.length !== soll.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(soll))) return json(res, 403, { ok: false, fehler: 'Link ungültig' })
  const p = ablage.datei(id, datei)
  if (!p) return json(res, 404, { ok: false })
  const r = ablage.record(id), name = datei === 'vertrag.pdf' ? `Vertrag-${id}.pdf` : `Rechnung-${r?.rechnung?.nr || id}.pdf`
  senden_(res, 200, fs.readFileSync(p), 'application/pdf', { 'Content-Disposition': `inline; filename="${name}"` })
}

// ── Routing ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/healthz') return senden_(res, 200, 'ok\n', 'text/plain')
    if (!passwortOk(req)) return senden_(res, 401, 'Passwort erforderlich', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Heim & Partner", charset="UTF-8"' })
    if (url.pathname.startsWith('/api/vertrag/')) {
      const teil = url.pathname.slice('/api/vertrag/'.length).split('/')
      if (req.method === 'GET' && teil[0] === 'katalog') return json(res, 200, { add: KAT.add, net: KAT.net, care: KAT.care, websiteExtraMonat: KAT.websiteExtraMonat, pay: KAT.pay, nr: KAT.nr, datum: KAT.datum, gueltig: KAT.gueltig, paket: KAT.paket, offen: Date.now() <= gueltigBis().getTime() })
      if (req.method === 'GET' && teil[0] === 'text') {
        const st = hkSteuer()
        let s = fs.readFileSync(path.join(HIER, 'vorlage', 'vertrag.html'), 'utf8')
        s = st ? s.replace('USt-IdNr. {{HK_USTID}}', `${st.art} ${esc(st.wert)}`) : s.replace(' · USt-IdNr. {{HK_USTID}}', '')
        for (const k of ['GF', 'ANSPRECHPARTNER', 'VERTRETUNG']) s = s.replace(`{{${k}}}`, `<span class="ph" data-ph="${k}"></span>`)
        s = s.replace('{{ANLAGE8}}', '<div data-ph="ANLAGE8"></div>').replace('{{UNTERSCHRIFTEN}}', unterschriften(KAT, null))
        return senden_(res, 200, s, 'text/html; charset=utf-8')
      }
      if (req.method === 'POST' && teil[0] === 'vorschau') return await vorschau(req, res)
      if (req.method === 'POST' && teil[0] === 'unterschreiben') return await unterschreiben(req, res)
      if (req.method === 'GET' && teil[0] === 'dokument' && teil.length === 3) return dokument(req, res, decodeURIComponent(teil[1]), teil[2])
      return json(res, 404, { ok: false })
    }
    // Kurzlink zum Vertrag, z. B. für die Mail an Heim & Partner
    if (url.pathname === '/vertrag' || url.pathname === '/vertrag/') { res.writeHead(302, { ...HEADER, Location: '/angebot/vertrag/' + url.search }); return res.end() }
    if (req.method !== 'GET' && req.method !== 'HEAD') return senden_(res, 405, 'Method Not Allowed', 'text/plain', { Allow: 'GET, HEAD' })
    return statisch(req, res, url)
  } catch (e) {
    console.error('[server]', req.method, url.pathname, e)
    if (!res.headersSent) json(res, e.status || 500, { ok: false, fehler: e.status ? e.message : 'Interner Fehler. Bitte erneut versuchen oder per E-Mail an ' + KAT.hk.mail })
  }
})

server.listen(PORT, () => {
  console.log(`[server] Port ${PORT}, Seiten aus ${SITE}, Ablage ${ablage.dir}`)
  console.log(`[server] Vorab-Unterschrift Auftragnehmer: ${HK_VORAB ? HK_VORAB.name + ', ' + HK_VORAB.datum : 'keine'}`)
  console.log(`[server] Passwortschutz: ${process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD ? 'an' : 'aus'} · E-Mail: ${mailKonfiguriert() ? 'Resend' : 'aus (Postausgang)'} · Rechnung: ${hkSteuer() && process.env.HK_IBAN && process.env.HK_BANK ? 'an' : 'aus (Steuer- oder Bankdaten fehlen)'}`)
})
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); schliessen().finally(() => process.exit(0)) })
