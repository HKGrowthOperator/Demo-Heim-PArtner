// Vertrag, Anzahlungsrechnung und E-Mail als HTML, im Design der Angebote.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { plan, plusMonate, monateText } from './zahlung.mjs'

const HIER = path.dirname(fileURLToPath(import.meta.url))
const VORLAGE = fs.readFileSync(path.join(HIER, 'vorlage', 'vertrag.html'), 'utf8')
// Vorab-Unterschrift für den Auftragnehmer (Bild und Angaben), falls hinterlegt
function vorab() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(HIER, 'vorlage', 'hk-unterschrift.json'), 'utf8'))
    const png = fs.readFileSync(path.join(HIER, 'vorlage', 'hk-unterschrift.png')).toString('base64')
    return { ...info, bild: 'data:image/png;base64,' + png }
  } catch { return null }
}
export const HK_VORAB = vorab()
const schrift = f => fs.readFileSync(path.join(HIER, 'fonts', f)).toString('base64')
const FONTS = `@font-face{font-family:Geist;src:url(data:font/woff2;base64,${schrift('Geist-Variable.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:'Geist Mono';src:url(data:font/woff2;base64,${schrift('GeistMono-Variable.woff2')}) format('woff2');font-weight:100 900}`

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const eur = n => (Number.isInteger(n) ? n.toLocaleString('de-DE') : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €'
export const eur2 = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const TZ = 'Europe/Berlin'
export const datum = d => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
export const uhrzeit = d => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d)

const CSS = `${FONTS}
:root{--ink:#1d2427;--ink-2:#4d585c;--ink-3:#6b7478;--line:#dfe4e5;--line-2:#cdd4d6;--sunk:#f1f4f4;--accent:#1f6f78;--accent-soft:#e6f2f3}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:var(--ink);font:400 9.6pt/1.5 Geist,Helvetica,Arial,sans-serif}
.num,td.r{font-family:'Geist Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.kopf{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:22px}
.brand{display:flex;gap:9px;align-items:center}.logo{width:26px;height:26px;border-radius:6px;background:#22292c;color:#fff;display:grid;place-items:center;font:700 9px Geist}
.kopf .xs,.xs{font-size:7.8pt;color:var(--ink-3)}
.kopf .meta{text-align:right}
h1,h2,h3{font-weight:600;letter-spacing:-.01em;margin:0}
h1.vt{font-size:16pt;line-height:1.2;text-align:center;margin:10px 0 6px;text-wrap:balance}
.vt-sub{text-align:center;margin:0 0 14px}
.parteien{text-align:center;margin-bottom:18px}.parteien p{margin:0 0 3px;text-align:center}
h2{font-size:11.5pt;color:var(--accent);margin:16px 0 6px;break-after:avoid}
h3{font-size:10pt;color:var(--accent);margin:12px 0 5px;break-after:avoid}
h2.anl{break-before:page;margin-top:0}
p{margin:0 0 6px;text-align:justify;hyphens:auto}
p.cl{padding-left:2.1em;text-indent:-2.1em}.cn{display:inline-block;width:2.1em;text-indent:0}
ul{margin:2px 0 8px;padding-left:1.4em}li{margin:0 0 2px}li p{margin:0}
.tw{margin:6px 0 10px;break-inside:auto}
table{width:100%;border-collapse:collapse;font-size:8.4pt}
th{text-align:left;font-weight:600;background:var(--sunk);border-bottom:1px solid var(--line-2)}
th,td{padding:4px 6px;vertical-align:top;border-bottom:1px solid var(--line)}
td p,th p{margin:0;text-align:left}
td.r,th.r{text-align:right;white-space:nowrap}
tr{break-inside:avoid}
tr.sum td{font-weight:600;border-top:1px solid var(--line-2)}
.ph-leer{color:var(--ink-3)}
.sig2{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:8px;break-inside:avoid}
.sig2>div{display:flex;flex-direction:column;gap:4px}
.sig2>div>b:first-child{min-height:2.9em}
.sigpart{display:flex;flex-direction:column;gap:6px;margin-top:10px;break-inside:avoid}
.sig3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.sigfeld{display:flex;flex-direction:column;gap:3px;break-inside:avoid;min-width:0}
.sigfeld p{margin:0}
.sigbox{height:62px;border-bottom:1px solid #333;display:flex;align-items:flex-end}
.sigbox img{max-height:58px;max-width:100%}
.sigtext{font-size:8.4pt;color:var(--ink-2);padding-bottom:4px}
.unterschriften{break-inside:avoid;margin-top:14px}
.protokoll{break-before:page}
.box{border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;background:var(--sunk);margin:8px 0}
.wm{position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-24deg);font:700 46pt Geist;color:rgba(200,60,40,.13);z-index:9;pointer-events:none}
/* Rechnung */
.rg .adr{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;margin:8px 0 26px}
.rg .absender{font-size:7.4pt;color:var(--ink-3);text-decoration:underline;margin-bottom:6px}
.rg h1{font-size:15pt;margin:0 0 12px}
.rg table.meta td{border:0;padding:1px 0}.rg table.meta td:first-child{color:var(--ink-3);width:40%}
.rg .tot td{font-size:9.6pt}
.fuss{margin-top:26px;padding-top:8px;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:7.4pt;color:var(--ink-3)}`

function kopf(kat, rechts) {
  const hk = kat.hk
  return `<header class="kopf"><div class="brand"><div class="logo">HK</div><div><b>${esc(hk.name)}</b><div class="xs">${esc(hk.str)} · ${esc(hk.ort)} · ${esc(hk.tel)} · ${esc(hk.mail)}</div></div></div><div class="meta xs">${rechts}</div></header>`
}
const seite = (titel, inhalt, extra = '') => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>${CSS}</style></head><body>${extra}${inhalt}</body></html>`

export function hkSteuer() {
  const ust = (process.env.HK_USTID || '').trim(), stnr = (process.env.HK_STEUERNR || '').trim()
  return ust ? { art: 'USt-IdNr.', wert: ust } : stnr ? { art: 'Steuernummer', wert: stnr } : null
}

function anlage8(kat, c, zp) {
  const z = (l, b, m, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${b}</td><td class="r">${m}</td></tr>`
  let h = ''
  h += c.posten.length
    ? `<div class="tw"><table><thead><tr><th style="width:30px">Pos.</th><th>Erweiterung</th><th class="r">Menge</th><th class="r">Einmalig netto</th><th class="r">Monatlich netto</th></tr></thead><tbody>${c.posten.map((p, i) => `<tr><td>E${i + 1}</td><td>${esc(p.name)}<div class="xs">${esc(p.gruppe)}</div></td><td class="r">${p.menge}</td><td class="r">${p.summe ? eur(p.summe) : '–'}</td><td class="r">${p.summeMonat ? eur(p.summeMonat) : '–'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p>Es sind keine Erweiterungen beauftragt. Es gelten Festpreis und Zahlungsplan nach § 7 und Anlage 3.</p>'
  h += `<h3>Gesamtpreis</h3><div class="tw"><table><thead><tr><th></th><th class="r">Einmalig netto</th><th class="r">Monatlich netto ab Go-live</th></tr></thead><tbody>`
  h += z(esc(kat.paket), eur(kat.net), eur(kat.care))
  if (c.posten.length) h += z('Gewählte Erweiterungen', eur(c.einmal), c.monat ? eur(c.monat) : '–')
  if (c.webMonat) h += z('Erweiterte Website-Betreuung wegen gewählter Website-Erweiterungen', '–', eur(c.webMonat))
  h += z('Summe netto', eur(c.net), eur(c.mon), 'sum') + z('zzgl. 19 % USt.', eur2(c.ust), eur2(Math.round(c.mon * 19) / 100)) + z('Summe brutto', eur2(c.brutto), eur2(Math.round(c.mon * 119) / 100), 'sum')
  h += `</tbody></table></div><h3>Zahlungsplan auf die Summe</h3>${planTabelle(zp)}`
  h += `<p class="cl"><span class="cn">(1)</span>Zusätzlich zum Festpreis nach § 7 beauftragt der Auftraggeber die oben aufgeführten Erweiterungen zu den genannten Festpreisen. Für sie gelten die Regelungen dieses Vertrags entsprechend.</p>`
  h += `<p class="cl"><span class="cn">(2)</span>Der Zahlungsplan nach § 7 Abs. 2 und Anlage 3 gilt für die Summe einschließlich der Erweiterungen; maßgeblich sind die Beträge dieser Anlage.</p>`
  h += `<p class="cl"><span class="cn">(3)</span>Monatliche Beträge fallen ab Go-live gemeinsam mit der Betreuung nach Anlage 5 an, mit derselben Laufzeit und Kündigungsfrist.</p>`
  if (c.angefragt.length) h += `<p class="cl"><span class="cn">(4)</span>Für ${c.angefragt.map(a => esc(a.name)).join(', ')} erstellt der Auftragnehmer ein gesondertes Angebot. Diese Leistungen sind nicht Bestandteil dieses Vertrags.</p>`
  return h
}

function planTabelle(zp) {
  return `<div class="tw"><table><thead><tr><th>Zahlung</th><th>Fällig</th><th class="r">Netto</th><th class="r">Brutto</th></tr></thead><tbody>${zp.map(r => `<tr><td>${esc(r.name)}${r.anteil ? `, ${esc(r.anteil)}` : ''}</td><td>${esc(r.wann)}</td><td class="r">${eur2(r.netto)}</td><td class="r">${eur2(Math.round(r.netto * 119) / 100)}</td></tr>`).join('')}</tbody></table></div>`
}

/** Text für § 7 Abs. 2, bezogen auf den Festpreis. opt: { variante, raten } */
export function zahlungText(kat, opt = {}) {
  const zp = plan(kat, kat.net, opt.variante, opt.raten)
  if (opt.variante !== 'raten') return `Der Festpreis ist wie folgt fällig: ${zp.map(r => `${r.anteil} ${r.wann} (${eur(r.netto)} netto)`).join(' und ')}.`
  const raten = zp.slice(1), rest = Math.round((kat.net - zp[0].netto) * 100) / 100
  const wann = raten.map(r => monateText(r.monate)).join(', ').replace(/, ([^,]*)$/, ' und $1')
  return `Der Festpreis ist wie folgt fällig: 50 % bei Auftragserteilung (${eur(zp[0].netto)} netto); die übrigen 50 % (${eur(rest)} netto) in ${raten.length} gleichen Monatsraten zu je ${eur2(raten[0].netto)} netto, fällig ${wann} nach Auftragserteilung, unabhängig vom Projektfortschritt. Der Auftragnehmer stellt bei Auftragserteilung eine Rechnung mit diesem Zahlungsplan.`
}

/** § 7 Abs. 2 und Zahlungsplan in Anlage 3 in die Vorlage einsetzen. */
export function zahlungFuellen(s, kat, opt = {}) {
  return s.replace('{{ZAHLUNG}}', esc(zahlungText(kat, opt))).replace(/(?:<p>)?\{\{ZAHLUNGSPLAN\}\}(?:<\/p>)?/, planTabelle(plan(kat, kat.net, opt.variante, opt.raten)))
}

export function unterschriften(kat, u) {
  // Ein Feld je Partner des Auftraggebers; wer unterschreibt, bekommt Bild und Zeitpunkt, die übrigen bleiben frei
  const leer = (name, funktion) => `<div class="sigfeld"><p class="ph-leer">Ort, den Datum</p><div class="sigbox"></div><b>${esc(name)}</b><span class="xs">${esc(funktion)}</span></div>`
  const voll = x => `<div class="sigfeld"><p>${esc(x.ort)}, den ${esc(x.datum)}</p><div class="sigbox"><img src="${x.signatur}" alt="Unterschrift ${esc(x.name)}"></div><b>${esc(x.name)}</b><span class="xs">${esc(x.funktion)} · elektronisch unterschrieben am ${esc(x.datum)} um ${esc(x.uhrzeit)} Uhr</span></div>`
  const partner = (kat.vorbelegt && kat.vorbelegt.unterzeichner) || []
  const norm = t => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const treffer = u ? partner.findIndex(p => norm(p.name) === norm(u.name)) : -1
  let felder = partner.map((p, i) => (i === treffer ? voll(u) : leer(p.name, p.funktion))).join('')
  if (u && treffer < 0) felder += voll(u)
  if (!partner.length) felder = u ? voll(u) : leer('Name', 'Funktion')
  const v = HK_VORAB
  const an = v
    ? `<div class="sigfeld"><p>${esc(v.ort)}, den ${esc(v.datum)}</p><div class="sigbox"><img src="${v.bild}" alt="Unterschrift ${esc(v.name)}"></div><b>${esc(v.name)}</b><span class="xs">${esc(v.funktion)} · vorab elektronisch unterschrieben am ${esc(v.datum)}</span></div>`
    : `<div class="sigfeld"><p>${esc(kat.unterzeichnet.ort)}, den ${esc(kat.unterzeichnet.datum)}</p><div class="sigbox"><span class="sigtext">Angebot ${esc(kat.nr)} verbindlich abgegeben</span></div><b>${esc(kat.hk.gf)}</b><span class="xs">Geschäftsführer</span></div>`
  return `<section class="unterschriften"><h3>Unterschriften</h3>
<div class="sigpart"><b>Für den Auftraggeber: ${esc(kat.kunde.name)}</b><div class="sig3">${felder}</div><p class="xs">Es unterschreibt einer der genannten Geschäftsführer. Die übrigen Felder bleiben frei.</p></div>
<div class="sigpart"><b>Für den Auftragnehmer: ${esc(kat.hk.name)}</b><div class="sig3">${an}</div></div></section>`
}

/** Der reine Vertragsinhalt mit eingesetzten Angaben. f: { gf, ansprechpartner, vertretung } */
export function vertragsinhalt(kat, c, f, u = null, opt = {}) {
  const st = hkSteuer()
  let s = VORLAGE
  s = st ? s.replace('USt-IdNr. {{HK_USTID}}', `${st.art} ${esc(st.wert)}`) : s.replace(' · USt-IdNr. {{HK_USTID}}', '')
  s = s.replace('{{GF}}', f.gf ? esc(f.gf) : '<span class="ph-leer">[Geschäftsführer]</span>')
  s = s.replace('{{ANSPRECHPARTNER}}', f.ansprechpartner ? esc(f.ansprechpartner) : '<span class="ph-leer">[Ansprechpartner]</span>')
  s = s.replace('{{VERTRETUNG}}', f.vertretung ? esc(f.vertretung) : 'eine vom Auftraggeber in Textform noch zu benennende Person')
  s = zahlungFuellen(s, kat, opt)
  s = s.replace('{{ANLAGE8}}', anlage8(kat, c, plan(kat, c.net, opt.variante, opt.raten)))
  s = s.replace('{{UNTERSCHRIFTEN}}', unterschriften(kat, u))
  return s
}

export const sha256 = x => crypto.createHash('sha256').update(x).digest('hex')

export function vertragHtml(kat, c, f, { vnr, u = null, protokoll = null, vorschau = false, opt = {} } = {}) {
  const inhalt = vertragsinhalt(kat, c, f, u, opt)
  const rechts = `${vnr ? `Vertrag Nr. ${esc(vnr)}<br>` : ''}zum Angebot ${esc(kat.nr)} vom ${esc(kat.datum)}`
  let p = ''
  if (protokoll) {
    const zeilen = [
      ['Vertrag', `Nr. ${protokoll.vnr} · ${kat.paket}`],
      ['Unterzeichnet von', `${protokoll.name}, ${protokoll.funktion}, für ${kat.kunde.name}`],
      ['E-Mail', protokoll.email],
      ['Ort', protokoll.ort],
      ['Zeitpunkt', `${protokoll.datum}, ${protokoll.uhrzeit} Uhr (Europe/Berlin) · ${protokoll.iso}`],
      ['IP-Adresse', protokoll.ip],
      ['Browser', protokoll.ua],
      ['Zahlungsweise', opt.variante === 'raten' ? `50 % bei Auftragserteilung, Rest in ${opt.raten} Monatsraten` : 'laut Katalog: ' + kat.pay.map(p => `${p.pct} % ${p.wann}`).join(', ')],
      ['Bestätigt', 'Vertretungsberechtigung für den Auftraggeber; Vertrag mit Anlagen 1 bis 8 gelesen und Angebot verbindlich angenommen'],
      ...(HK_VORAB ? [['Für den Auftragnehmer', `Vorab unterschrieben von ${HK_VORAB.name}, ${HK_VORAB.funktion}, am ${HK_VORAB.datum} in ${HK_VORAB.ort}`]] : []),
      ['Art der Unterschrift', 'Einfache elektronische Signatur: handschriftliche Unterschrift auf dem Bildschirm. Der Vertrag verlangt Textform (§ 126b BGB).'],
      ['Prüfsumme Vertragsinhalt', `SHA-256 ${protokoll.hash}`],
    ]
    p = `<section class="protokoll"><h2>Prüfprotokoll der elektronischen Unterzeichnung</h2><div class="tw"><table><tbody>${zeilen.map(([a, b]) => `<tr><td style="width:30%">${esc(a)}</td><td style="word-break:break-all">${esc(b)}</td></tr>`).join('')}</tbody></table></div><p class="xs">Die Prüfsumme bezieht sich auf den Vertragsinhalt vor diesem Protokoll. Eine Kopie des Vertrags und dieses Protokolls ist beim Auftragnehmer gespeichert.</p></section>`
  }
  const wm = vorschau ? '<div class="wm">Vorschau · nicht unterschrieben</div>' : ''
  return { inhalt, html: seite(`Vertrag ${vnr || 'Vorschau'}`, kopf(kat, rechts) + `<main>${inhalt}</main>` + p, wm) }
}

const r2 = n => Math.round(n * 100) / 100

/** Gemeinsamer Rahmen: Kopf, Adressen, Kennzahlen, Text, Bank, Fuß. meta: [[Bezeichnung, Wert]] */
function rechnungRahmen(kat, r, titel, meta, koerper, verwendung) {
  const hk = kat.hk, k = kat.kunde, st = hkSteuer()
  const bank = [['Kontoinhaber', hk.name], ['IBAN', process.env.HK_IBAN], ['BIC', process.env.HK_BIC], ['Bank', process.env.HK_BANK]].filter(x => x[1])
  const inhalt = `${kopf(kat, `Rechnung Nr. ${esc(r.nr)}`)}<div class="rg">
<div class="adr"><div><div class="absender">${esc(hk.name)} · ${esc(hk.str)} · ${esc(hk.ort)}</div><b>${esc(k.name)}</b><br>${esc(k.str)}<br>${esc(k.ort)}<br><span class="xs">USt-IdNr. ${esc(k.ustid)}</span></div>
<div><table class="meta"><tbody>${[['Rechnungsnummer', `<b>${esc(r.nr)}</b>`], ['Rechnungsdatum', esc(r.datum)], ...meta.map(([a, b]) => [esc(a), esc(b)])].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div></div>
<h1>${esc(titel)}</h1>
${koerper}
<div class="box"><table class="meta"><tbody>${bank.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${esc(v)}</td></tr>`).join('')}<tr><td>Verwendungszweck</td><td class="num">${esc(verwendung)}</td></tr></tbody></table></div>
<div class="fuss"><div>${esc(hk.name)}<br>${esc(hk.str)}, ${esc(hk.ort)}</div><div>Geschäftsführer: ${esc(hk.gf)}<br>${esc(hk.hr)}<br>${st ? `${esc(st.art)} ${esc(st.wert)}` : ''}</div><div>${esc(hk.tel)}<br>${esc(hk.mail)}<br>${esc(hk.web)}</div></div></div>`
  return seite(`Rechnung ${r.nr}`, inhalt)
}
const leistung = (kat, c) => `${esc(kat.paket)}${c.posten.length ? ' einschließlich gewählter Erweiterungen nach Anlage 8' : ''}`

/** Anzahlungsrechnung (Standard): erste Zeile des Zahlungsplans. r: { nr, datum, faellig, vnr } */
export function rechnungHtml(kat, c, r, opt = {}) {
  if (opt.variante === 'raten') return ratenRechnungHtml(kat, c, r, opt)
  const a = plan(kat, c.net)[0], ust = r2(a.netto * 0.19), brutto = r2(a.netto + ust)
  const koerper = `<p>Gemäß Vertrag ${esc(r.vnr)} stellen wir die Anzahlung von ${esc(a.anteil)} ${esc(a.wann)} in Rechnung.</p>
<div class="tw"><table><thead><tr><th style="width:30px">Pos.</th><th>Leistung</th><th class="r">Betrag netto</th></tr></thead><tbody>
<tr><td>1</td><td><b>${esc(a.name)} ${esc(a.anteil)}</b> auf ${leistung(kat, c)}<div class="xs">Vertragssumme ${eur2(c.net)} netto. Leistungszeitraum laut Vertrag ab Projektstart, spätestens 2 Wochen nach Unterzeichnung. Anzahlung vor Leistungserbringung.</div></td><td class="r">${eur2(a.netto)}</td></tr>
<tr class="tot sum"><td></td><td>Summe netto</td><td class="r">${eur2(a.netto)}</td></tr>
<tr class="tot"><td></td><td>zzgl. 19 % Umsatzsteuer</td><td class="r">${eur2(ust)}</td></tr>
<tr class="tot sum"><td></td><td>Rechnungsbetrag</td><td class="r">${eur2(brutto)}</td></tr></tbody></table></div>
<p>Bitte überweist den Rechnungsbetrag bis ${esc(r.faellig)} ohne Abzug unter Angabe der Rechnungsnummer ${esc(r.nr)}. Die Anzahlung wird in der Schlussrechnung angerechnet.</p>`
  const html = rechnungRahmen(kat, r, 'Anzahlungsrechnung', [['Vertrag', `${r.vnr} vom ${r.datum}`], ['Angebot', `${kat.nr} vom ${kat.datum}`], ['Zahlbar bis', r.faellig]], koerper, r.nr)
  return { html, art: 'anzahlung', netto: a.netto, ust, brutto, faellig: r.faellig }
}

/** Rechnung mit Zahlungsplan (Raten): Vertragssumme, fällig in Anzahlung und Monatsraten. */
function ratenRechnungHtml(kat, c, r, opt) {
  const zp = plan(kat, c.net, 'raten', opt.raten)
  const zeilen = zp.map((z, i) => ({ ...z, faellig: i === 0 ? r.faellig : datum(plusMonate(r.jetzt, z.monate)), ust: r2(z.netto * 0.19) }))
  zeilen.forEach(z => { z.brutto = r2(z.netto + z.ust) })
  const diff = r2(c.brutto - zeilen.reduce((a, z) => a + z.brutto, 0))
  if (diff) { const l = zeilen[zeilen.length - 1]; l.ust = r2(l.ust + diff); l.brutto = r2(l.brutto + diff) }
  const koerper = `<p>Gemäß Vertrag ${esc(r.vnr)} stellen wir die Vertragssumme mit dem vereinbarten Zahlungsplan in Rechnung: 50 % bei Auftragserteilung, der Rest in ${zp.length - 1} Monatsraten.</p>
<div class="tw"><table><thead><tr><th style="width:30px">Pos.</th><th>Leistung</th><th class="r">Betrag netto</th></tr></thead><tbody>
<tr><td>1</td><td><b>${leistung(kat, c)}</b><div class="xs">Festpreis laut Vertrag. Vorausrechnung: Leistungszeitraum ab Projektstart, spätestens 2 Wochen nach Unterzeichnung, bis zur Gesamtabnahme.</div></td><td class="r">${eur2(c.net)}</td></tr>
<tr class="tot sum"><td></td><td>Summe netto</td><td class="r">${eur2(c.net)}</td></tr>
<tr class="tot"><td></td><td>zzgl. 19 % Umsatzsteuer</td><td class="r">${eur2(c.ust)}</td></tr>
<tr class="tot sum"><td></td><td>Rechnungsbetrag</td><td class="r">${eur2(c.brutto)}</td></tr></tbody></table></div>
<h3>Zahlungsplan</h3>
<div class="tw"><table><thead><tr><th>Zahlung</th><th>Fällig am</th><th class="r">Netto</th><th class="r">USt.</th><th class="r">Brutto</th></tr></thead><tbody>${zeilen.map(z => `<tr><td>${esc(z.name)}${z.anteil ? `, ${esc(z.anteil)}` : ''}</td><td>${esc(z.faellig)}</td><td class="r">${eur2(z.netto)}</td><td class="r">${eur2(z.ust)}</td><td class="r">${eur2(z.brutto)}</td></tr>`).join('')}<tr class="sum"><td>Summe</td><td></td><td class="r">${eur2(c.net)}</td><td class="r">${eur2(c.ust)}</td><td class="r">${eur2(c.brutto)}</td></tr></tbody></table></div>
<p>Bitte überweist die Beträge jeweils bis zum Fälligkeitsdatum ohne Abzug, mit Rechnungsnummer und Zahlung im Verwendungszweck. Die Umsatzsteuer entsteht mit dem Eingang der jeweiligen Zahlung. Nach der Gesamtabnahme erhaltet ihr die Schlussrechnung, in der alle Zahlungen angerechnet werden.</p>`
  const html = rechnungRahmen(kat, r, 'Rechnung mit Zahlungsplan', [['Vertrag', `${r.vnr} vom ${r.datum}`], ['Angebot', `${kat.nr} vom ${kat.datum}`], ['Erste Zahlung bis', r.faellig]], koerper, `${r.nr}, Anzahlung bzw. Rate`)
  return { html, art: 'raten', netto: c.net, ust: c.ust, brutto: c.brutto, faellig: r.faellig, plan: zeilen.map(z => ({ name: z.name, faellig: z.faellig, netto: z.netto, ust: z.ust, brutto: z.brutto })) }
}

/** Schlussrechnung nach Gesamtabnahme, mit Abzug der bereits berechneten Beträge (§ 14 Abs. 5 UStG).
 *  rec: gespeicherter Vertrag; r: { nr, datum, faellig, abnahme } */
export function schlussrechnungHtml(kat, rec, r) {
  const net = rec.summe.net, ust = r2(net * 0.19), brutto = r2(net + ust)
  const v = rec.rechnung, restN = r2(net - v.netto), restU = r2(ust - v.ust), restB = r2(restN + restU)
  const vorher = v.art === 'raten' ? 'Rechnung mit Zahlungsplan' : 'Anzahlungsrechnung'
  const vertragVom = datum(new Date(rec.angelegt))
  const koerper = `<p>Nach der Gesamtabnahme am ${esc(r.abnahme)} rechnen wir die Leistungen aus Vertrag ${esc(rec.vnr)} ab.</p>
<div class="tw"><table><thead><tr><th style="width:30px">Pos.</th><th>Leistung</th><th class="r">Betrag netto</th></tr></thead><tbody>
<tr><td>1</td><td><b>${esc(kat.paket)}${rec.posten && rec.posten.length ? ' einschließlich Erweiterungen nach Anlage 8' : ''}</b><div class="xs">Leistungszeitraum ${esc(vertragVom)} bis ${esc(r.abnahme)} (Gesamtabnahme).</div></td><td class="r">${eur2(net)}</td></tr>
<tr class="tot sum"><td></td><td>Summe netto</td><td class="r">${eur2(net)}</td></tr>
<tr class="tot"><td></td><td>zzgl. 19 % Umsatzsteuer</td><td class="r">${eur2(ust)}</td></tr>
<tr class="tot sum"><td></td><td>Gesamtbetrag</td><td class="r">${eur2(brutto)}</td></tr>
<tr class="tot"><td></td><td>abzüglich ${esc(vorher)} Nr. ${esc(v.nr)} vom ${esc(v.datum || vertragVom)}, netto</td><td class="r">−${eur2(v.netto)}</td></tr>
<tr class="tot"><td></td><td>abzüglich darin enthaltene Umsatzsteuer</td><td class="r">−${eur2(v.ust)}</td></tr>
<tr class="tot sum"><td></td><td>Restbetrag netto</td><td class="r">${eur2(restN)}</td></tr>
<tr class="tot"><td></td><td>zzgl. 19 % Umsatzsteuer</td><td class="r">${eur2(restU)}</td></tr>
<tr class="tot sum"><td></td><td>Zahlbetrag</td><td class="r">${eur2(restB)}</td></tr></tbody></table></div>
${restB > 0 ? `<p>Bitte überweist den Zahlbetrag bis ${esc(r.faellig)} ohne Abzug unter Angabe der Rechnungsnummer ${esc(r.nr)}.</p>` : `<p>Der Gesamtbetrag ist bereits mit der ${esc(vorher)} Nr. ${esc(v.nr)} berechnet. Noch offene Raten bleiben nach deren Zahlungsplan fällig, ein weiterer Betrag ist nicht zu zahlen.</p>`}`
  const html = rechnungRahmen(kat, r, 'Schlussrechnung', [['Vertrag', `${rec.vnr} vom ${vertragVom}`], ['Gesamtabnahme', r.abnahme], ...(restB > 0 ? [['Zahlbar bis', r.faellig]] : [])], koerper, r.nr)
  return { html, netto: restN, ust: restU, brutto: restB, gesamt: { netto: net, ust, brutto } }
}

function mailHtml(kat, anrede, zeilen, gruss, fuss = '') {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f4f6f6;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d2427"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe4e5;border-radius:10px"><tr><td style="padding:24px 28px">
<p style="margin:0 0 16px;font-weight:600;font-size:13px;color:#6b7478;letter-spacing:.06em;text-transform:uppercase">${esc(kat.hk.name)}</p>
<p style="margin:0 0 14px">${esc(anrede)}</p>${zeilen.map(z => `<p style="margin:0 0 14px">${z}</p>`).join('')}
<p style="margin:18px 0 0;white-space:pre-line">${esc(gruss)}</p>${fuss ? `<p style="margin:20px 0 0;font-size:12px;color:#6b7478">${fuss}</p>` : ''}</td></tr></table></td></tr></table></body></html>`
}
const grussText = kat => `Viele Grüße\n${HK_VORAB ? HK_VORAB.name : kat.hk.gf}\n${kat.hk.name}\n${kat.hk.tel} · ${kat.hk.mail}`

/** Mail an den Kunden nach der Unterschrift. x: { vnr, name, rechnung, pdfHash } */
export function mailInhalt(kat, c, x) {
  const rg = x.rechnung
  const rgText = !rg ? ' Die Rechnung schicken wir separat.'
    : rg.art === 'raten' ? ` und die Rechnung ${rg.nr} mit Zahlungsplan über ${eur2(rg.brutto)}: Anzahlung ${eur2(rg.plan[0].brutto)} bis ${rg.plan[0].faellig}, danach ${rg.plan.length - 1} Monatsraten zu je ${eur2(rg.plan[1].brutto)}, die letzte ${rg.plan[rg.plan.length - 1].brutto !== rg.plan[1].brutto ? `über ${eur2(rg.plan[rg.plan.length - 1].brutto)} ` : ''}am ${rg.plan[rg.plan.length - 1].faellig}.`
    : ` und die Anzahlungsrechnung ${rg.nr} über ${eur2(rg.brutto)}, zahlbar bis ${rg.faellig}.`
  const zeilen = [
    `vielen Dank für eure Unterschrift. Im Anhang findet ihr den unterschriebenen Vertrag ${x.vnr} zum ${kat.paket}${rg ? rgText : '.' + rgText}`,
    `Vertragssumme ${eur2(c.net)} netto${c.posten.length ? `, davon Erweiterungen ${eur2(c.einmal)}` : ''}. Monatlich ab Go-live ${eur2(c.mon)} netto.`,
    'Als Nächstes melden wir uns für den Termin zur Prozessanalyse in Nauheim. Projektstart ist spätestens 2 Wochen nach Unterzeichnung.',
  ]
  const gruss = grussText(kat)
  const text = `Guten Tag ${x.name},\n\n${zeilen.join('\n\n')}\n\nPrüfsumme des Vertrags-PDF (SHA-256): ${x.pdfHash}\n\n${gruss}`
  return { text, html: mailHtml(kat, `Guten Tag ${x.name},`, zeilen.map(esc), gruss, `Prüfsumme des Vertrags-PDF (SHA-256): ${esc(x.pdfHash)}`) }
}

/** Interne Mail an HK: Zusammenfassung und Link für die Schlussrechnung (nie an den Kunden). */
export function mailIntern(kat, c, x) {
  const z = [
    `Vertrag ${x.vnr} ist unterschrieben von ${x.name} (${x.email}) für ${kat.kunde.name}.`,
    `Summe ${eur2(c.net)} netto, monatlich ${eur2(c.mon)} netto ab Go-live. Zahlungsweise: ${x.zahlungsweise}.`,
    x.rechnung ? `Rechnung ${x.rechnung.nr} über ${eur2(x.rechnung.brutto)} ist an ${x.an.join(', ')} gegangen.` : `Rechnung offen: In Coolify fehlen ${x.rechnungFehlt.join(', ')}.`,
    `Nach der Gesamtabnahme die Schlussrechnung per Klick erstellen und senden: ${x.schlussLink}`,
  ]
  const text = `${z.join('\n\n')}\n\nVertrag und Rechnung hängen an.`
  const html = mailHtml(kat, 'Intern, nicht weiterleiten.', [esc(z[0]), esc(z[1]), esc(z[2]), `Nach der Gesamtabnahme die Schlussrechnung per Klick erstellen und senden:<br><a href="${esc(x.schlussLink)}">Schlussrechnung ${esc(x.vnr)} erstellen</a>`], 'Vertrag und Rechnung hängen an.')
  return { text, html }
}

/** Mail an den Kunden mit der Schlussrechnung. */
export function mailSchluss(kat, rec, x) {
  const zeilen = [
    `vielen Dank für die Abnahme. Im Anhang findet ihr die Schlussrechnung ${x.nr} zu Vertrag ${rec.vnr}.`,
    x.brutto > 0 ? `Nach Abzug der bereits berechneten ${eur2(rec.rechnung.brutto)} beträgt der Zahlbetrag ${eur2(x.brutto)}, zahlbar bis ${x.faellig}.` : 'Der Gesamtbetrag ist bereits berechnet, mit dieser Rechnung ist kein weiterer Betrag zu zahlen. Noch offene Raten bleiben nach dem Zahlungsplan fällig.',
  ]
  const gruss = grussText(kat)
  return { text: `Guten Tag ${rec.unterzeichner.name},\n\n${zeilen.join('\n\n')}\n\n${gruss}`, html: mailHtml(kat, `Guten Tag ${rec.unterzeichner.name},`, zeilen.map(esc), gruss) }
}
