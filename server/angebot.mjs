// Eine lesbare Angebotsfassung hält die besprochenen Annahmen und Konditionen gemeinsam fest.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { berechne, bereinigeAuswahl } from './preis.mjs'
import { plan, RATEN } from './zahlung.mjs'

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])
const n = value => value.toLocaleString('de-DE', {maximumFractionDigits:2})
const euro = value => n(value) + ' €'
const betrag = value => value.toLocaleString('de-DE', {style:'currency',currency:'EUR'})
const fehler = (status, message) => Object.assign(new Error(message), {status})
const zeile = (name, ...werte) => '<tr><td>'+e(name)+'</td>'+werte.map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>'
const tabelle = (titel, body) => '<table><thead><tr>'+titel.map(t=>'<th>'+e(t)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table>'
const angaben = {gespraechsziel:'Ziel',gespraechsfall:'Beispiel aus eurer Praxis',erfolgskriterium:'Erfolgskriterium',startprojekt:'Startprojekt',verantwortlich:'Projektverantwortung',wunschstart:'Gewünschter Start'}
const wert = (v, standard, max = 1e6) => {
  if (v === undefined) return standard
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw fehler(400, 'Bitte die Modellannahmen prüfen.')
  return v
}
export function angebotModell(datei) {
  const zeile = fs.readFileSync(datei, 'utf8').match(/^const OF=(\{.*\});$/m)
  if (!zeile) throw Error('Angebotsmodell fehlt.')
  return JSON.parse(zeile[1])
}
// Änderungen der Vertragsvorlage, der Auswahlregeln oder der Anlagen erfordern eine neue Angebotsfreigabe.
const vorlagenStand = crypto.createHash('sha256')
for (const name of ['vorlage/vertrag.html','vorlage/hk-unterschrift.json','dokumente.mjs','zahlung.mjs','preis.mjs']) {
  const file=new URL(name,import.meta.url)
  vorlagenStand.update(name).update('\0').update(fs.existsSync(file)?fs.readFileSync(file):'').update('\0')
}
const vorlagenHash = vorlagenStand.digest('hex')
export function vertragsbindung(kat, of, vorlage = vorlagenHash) {
  return crypto.createHash('sha256').update(JSON.stringify([vorlage,kat,of.B,of.KOND,of.NEV])).digest('hex')
}
export function fassung(kat, of, eingabe = {}, bindung=vertragsbindung(kat,of)) {
  const addons = bereinigeAuswahl(kat, eingabe.addons)
  const raten = eingabe.raten ?? 0
  if (raten !== 0 && !RATEN.includes(raten)) throw fehler(400,'Bitte den Zahlungsplan prüfen.')
  const c = berechne(kat, addons), roi = eingabe.roi ?? {}, tf = wert(roi.tf, 100, 100)
  const rollen = of.AREA.map(([id, name, , personen, zeit, satz, takt])=>{
    const a = roi.a?.[id] || {}
    const einheiten = wert(a.n, personen), stunden = wert(a.s,zeit), stundensatz = wert(a.r,satz)
    const h = einheiten * stunden * (takt === 'woche' ? 52 : 1) * tf / 100
    return {name,einheiten,stunden,stundensatz,takt,h,zeitwert:h*stundensatz}
  })
  const zusaetze = c.posten.map(p => ({...p,h:(of.AH[p.id] || 0)*tf/100,stundensatz:of.AR[p.id] || 0}))
  const h = rollen.reduce((s,p)=>s+p.h,0)+zusaetze.reduce((s,p)=>s+p.h,0)
  const zeitwert = rollen.reduce((s,p)=>s+p.zeitwert,0)+zusaetze.reduce((s,p)=>s+p.h*p.stundensatz,0)
  const gespraech = {}, freigegeben = eingabe.gespraechFreigabe === true ? eingabe.gespraech : null
  for (const key of Object.keys(angaben)) {
    const v = freigegeben?.[key]
    if (typeof v !== 'string' || !v.trim()) continue
    if (v.length>1200) throw fehler(400,'Gesprächsangabe zu lang.')
    if(key==='wunschstart' && !/^\d{4}-\d\d-\d\d$/.test(v)) throw fehler(400,'Ungültiges Wunschdatum.')
    gespraech[key]=v.trim()
  }
  if(freigegeben?.praxisstunden != null) gespraech.praxisstunden=wert(freigegeben.praxisstunden,0)
  return {bindung,nr:kat.nr,datum:kat.datum,gueltig:kat.gueltig,kunde:kat.kunde,hk:kat.hk,umfang:of.B.map(b=>[b[2],b[4]]),konditionen:of.KOND,ausnahmen:of.NEV,addons,raten,basis:kat.net,betreuung:kat.care,c,plan:plan(kat,c.net,raten?'raten':'standard',raten),rollen,zusaetze,tf,vol:wert(roi.vol,0),pct:wert(roi.pct,0.5,100),h,zeitwert,gespraech}
}
export function archiv(dir) {
  const ziel = path.join(dir, 'angebote')
  fs.mkdirSync(ziel, {recursive:true, mode:0o700})
  return {
    speichern(stand) {
      const id = crypto.randomBytes(24).toString('hex')
      const tmp=path.join(ziel,id+'.tmp'), datei=path.join(ziel,id+'.json')
      fs.writeFileSync(tmp, JSON.stringify(stand), {flag:'wx',mode:0o600})
      fs.renameSync(tmp,datei)
      return id
    },
    lesen(id) {
      if (!/^[0-9a-f]{48}$/.test(id || '')) throw fehler(404,'Diese Angebotsfassung ist nicht verfügbar.')
      try { return JSON.parse(fs.readFileSync(path.join(ziel,id+'.json'),'utf8')) }
      catch (error) { if (error.code==='ENOENT') throw fehler(404,'Diese Angebotsfassung ist nicht verfügbar.'); throw error }
    }
  }
}
export function verbindungPruefen(kat, alt, addons, raten, rolle, aktuelleBindung) {
  if (!aktuelleBindung || alt.bindung!==aktuelleBindung) throw fehler(409,'Die Vertragsunterlagen haben sich seit dieser Angebotsfassung geändert. Euer Angebot bleibt lesbar. Bitte fordert vor der Unterschrift eine neue Fassung an.')
  const auswahl=bereinigeAuswahl(kat,addons), c=berechne(kat,auswahl)
  if (kat.nr!==alt.nr || kat.gueltig!==alt.gueltig || kat.kunde.name!==alt.kunde.name || JSON.stringify(c)!==JSON.stringify(alt.c) || JSON.stringify(auswahl)!==JSON.stringify(alt.addons) || raten!==alt.raten || rolle!==(alt.raten?'raten':'standard')) throw fehler(409,'Diese Auswahl passt nicht zur Angebotsfassung. Bitte öffnet erneut den Vertrag aus eurem Angebot.')
}
export function vertragslink(s,id='') {
  const q=new URLSearchParams()
  if(id) q.set('stand',id)
  if(s.raten) q.set('raten',s.raten)
  const ids=Object.entries(s.addons).map(([k,v])=>k+(v>1?':'+v:''))
  if(ids.length) q.set('add',ids.join(','))
  return '/angebot/vertrag'+(s.raten?'-raten':'')+'/'+(q.size?'?'+q:'')
}
const css=`
*{box-sizing:border-box}body{margin:auto;max-width:900px;padding:clamp(16px,5vw,60px);font:16px/1.5 system-ui,sans-serif;color:#1f292d;background:#fff}header{border-bottom:2px solid #266b70;padding-bottom:20px}h1{font-size:clamp(28px,6vw,46px);line-height:1.1;margin:10px 0}h2{font-size:1.25rem;margin:1.8em 0 .5em}p{margin:.45em 0}small{color:#526367}table{width:100%;border-collapse:collapse;margin:.4em 0 1em}th,td{text-align:left;padding:.55em .4em;border-bottom:1px solid #d9e2df;vertical-align:top}th{font-size:.84em;background:#eef4f2}li{margin:.35em 0}.wert{background:#eaf3ef;padding:16px 18px;border-radius:8px;font-size:1.12em}.aktionen{display:flex;gap:.6em;flex-wrap:wrap;margin:1em 0}.aktionen>*{display:inline-block;font:inherit;font-weight:600;border-radius:6px;padding:.65em 1em;border:1px solid #286a6b;color:#235858;background:white;text-decoration:none;cursor:pointer}.aktionen a{background:#1e6668;color:white}details summary{cursor:pointer;font-weight:600}@media(max-width:600px){body{font-size:14px}th,td{padding:.45em .23em;overflow-wrap:anywhere}.rollen{overflow-x:auto}}@media print{@page{size:A4;margin:17mm}body{padding:0;max-width:100%;font-size:10pt}.aktionen,summary{display:none}h1,h2,h3{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}details>*,details:not([open])>*,details::details-content{display:block;content-visibility:visible}}
`
export function dokument(s,id='') {
 const {c,kunde,hk}=s
 const inhalt=s.umfang.map(([name,d])=>'<li><strong>'+e(name)+'</strong> · '+e(d)+'</li>').join('')
 const kosten=zeile('Gesamtumsetzung für Heim & Partner',euro(s.basis),euro(s.betreuung))+s.zusaetze.map(p=>zeile((p.menge>1?p.menge+' × ':'')+p.name,euro(p.summe),euro(p.summeMonat))).join('')+(c.webMonat?zeile('Zusätzliche Betreuung gewählter Website-Erweiterungen','',euro(c.webMonat)):'')+zeile('Summe netto',euro(c.net),euro(c.mon))+zeile('19 % Umsatzsteuer',betrag(c.ust),betrag(c.mon*.19))+zeile('Gesamt brutto',betrag(c.brutto),betrag(c.mon*1.19))
 const notizen=Object.entries(s.gespraech).map(([k,v])=>k==='praxisstunden'?zeile('Zeitgewinn im Praxisbeispiel',n(v)+' Std./Jahr, separat vom Teammodell'):zeile(angaben[k],v)).join('')
 return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Angebot '+e(s.nr)+' · Heim &amp; Partner</title><style>'+css+'</style></head><body><header><small>'+e(hk.name)+' · Angebot '+e(s.nr)+' vom '+e(s.datum)+'</small><h1>Ein System für Vergabe, Baustelle und Vertrieb</h1><p>Für <b>'+e(kunde.name)+'</b> · '+e(kunde.str)+', '+e(kunde.ort)+'</p><small>'+e(kunde.hr)+' · gültig bis '+e(s.gueltig)+(id?' · Fassung '+e(id.slice(0,12)):' · Grundangebot')+'</small></header><main><h2>Gesamtangebot</h2><p>Wir verbinden Vergabe, Baustelle und Vertrieb. Anfragen von eurer Website fließen direkt ins CRM. Einführung, Schulung und die vereinbarte Begleitung gehören dazu.</p><p class="wert"><b>'+euro(c.net)+' netto einmalig</b> · '+euro(c.mon)+' netto im Monat ab Livegang</p>'+tabelle(['Leistung','Einmalig netto','Monatlich netto'],kosten)+(c.angefragt.length?'<p>Separat angefragt, außerhalb des Preises: '+c.angefragt.map(a=>e(a.name)).join(', ')+'.</p>':'')+'<h2>Zahlungsplan</h2>'+tabelle(['Zahlung','Fälligkeit','Betrag netto'],s.plan.map(r=>zeile(r.name,r.wann,betrag(r.netto))).join(''))+'<p>Die Zahlungsfrist beträgt 14 Tage. KI-Verbrauch zum Selbstkostenpreis, mit einem Monatsbudget von 150 € und Freigabe für Mehrverbrauch.</p>'+(notizen?'<h2>Aus unserem Gespräch</h2><table>'+notizen+'</table>':'')+'<h2>Geschätzte freie Kapazität</h2><p><b>'+n(Math.round(s.h))+' Std./Jahr</b> entsprechen rechnerisch '+euro(Math.round(s.zeitwert))+' Zeitwert pro Jahr. Die Werte basieren auf euren Annahmen und sind keine garantierte Kostensenkung. Angesetzter Realisierungsgrad: '+n(s.tf)+' %.</p><div class="rollen">'+tabelle(['Bereich','Menge','Std. je Einheit','Stundensatz','Std./Jahr'],s.rollen.map(r=>zeile(r.name,n(r.einheiten),n(r.stunden)+(r.takt==='woche'?' je Woche':' je Gewerk/Jahr'),euro(r.stundensatz),n(r.h))).join('')+s.zusaetze.filter(p=>p.h).map(p=>zeile(p.name,'','','',n(p.h))).join(''))+'</div>'+(s.vol>0?'<p>Gesonderte Vergabepreisannahme: '+n(s.vol)+' Mio. € Volumen × '+n(s.pct)+' % = '+euro(s.vol*1e6*s.pct/100)+' je Jahr. Separat vom Zeitwert.</p>':'')+'<h2>Vereinbarter Umfang</h2><ul>'+inhalt+'</ul><h2>Konditionen</h2><table>'+s.konditionen.map(([k,v])=>zeile(k,v)).join('')+'</table><h2>Leistungsgrenzen</h2><ul>'+s.ausnahmen.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul><h2>Zum Vertrag</h2><p>Im Vertrag prüft ihr die Vertragspartei, die Vertretungsberechtigung und alle Anlagen. Die gewählten Erweiterungen und der Zahlungsplan werden übernommen.</p><div class="aktionen"><a href="'+e(vertragslink(s,id))+'">Vertrag prüfen</a><button type="button" onclick="window.print()">Drucken / als PDF sichern</button></div></main><footer><small>'+e(hk.name)+' · '+e(hk.str)+', '+e(hk.ort)+' · '+e(hk.hr)+' · '+e(hk.mail)+'</small></footer></body></html>'
}
