// Der Versandplan wird atomar mit dem beidseitig unterschriebenen PDF gespeichert.
// Nur beim echten Abschluss freigegebene Aufträge dürfen nach einem Neustart weiterlaufen.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { esc, eur2 } from './dokumente.mjs'
import { senden, mailKonfiguriert } from './mail.mjs'

function nachricht(an, betreff, zeilen, anhaenge) {
  return { an, betreff, text: zeilen.join('\n\n'),
    html: '<!doctype html><html lang="de"><body>'+zeilen.map(zeile=>'<p>'+esc(zeile)+'</p>').join('')+'</body></html>', anhaenge }
}

export function versandplan(record, hkEmpfaenger, schlussLink) {
  const { vnr, rechnung, unterzeichner, abrechnungsstand } = record
  const { hk, kunde } = abrechnungsstand
  const kundeAn = unterzeichner.email
  const rgAn = record.rechnungEmail || kundeAn
  const extra = !!rechnung && rgAn.toLowerCase() !== kundeAn.toLowerCase()
  const vertrag = { datei: 'vertrag.pdf', name: 'Vertrag-'+vnr+'.pdf' }
  const beleg = rechnung && { datei: 'rechnung.pdf', name: 'Rechnung-'+rechnung.nr+'.pdf' }
  const titel = rechnung?.art === 'raten' ? 'Rechnung mit Zahlungsplan' : 'Anzahlungsrechnung'
  const zeilen = ['Guten Tag '+unterzeichner.name+',',
    'anbei erhaltet ihr den von beiden Seiten unterschriebenen Vertrag '+vnr+' für '+kunde.name+'.']
  if(rechnung) zeilen.push(extra ? 'Die '+titel+' erhält eure Buchhaltung separat unter '+rgAn+'.' : 'Eure '+titel+' '+rechnung.nr+' liegt ebenfalls bei.')
  zeilen.push('Als Nächstes melden wir uns bei euch für den Termin zur Prozessanalyse in Nauheim.','Viele Grüße\n'+hk.name)
  const nachrichten = {
    kunde: nachricht([kundeAn], 'Euer unterschriebener Vertrag '+vnr, zeilen, beleg && !extra ? [vertrag,beleg] : [vertrag]),
    hk: nachricht(hkEmpfaenger, 'Unterzeichneter Vertrag '+vnr+' mit '+kunde.name,
      ['Der Vertrag zwischen '+hk.name+' und '+kunde.name+' ist von beiden Seiten unterschrieben. Das Vertrags-PDF liegt bei.',
       'Einmaliges Gesamtangebot '+eur2(record.summe.net)+' netto, monatlich '+eur2(record.summe.mon)+' netto ab Livegang.',
       rechnung ? titel+' '+rechnung.nr+' ist für '+rgAn+' vorgesehen.' : 'Die erste Rechnung steht noch aus.',
       'Interner Zugang zur Schlussrechnung nach der Gesamtabnahme: '+schlussLink], [vertrag])
  }
  if(extra) nachrichten.rechnung = nachricht([rgAn], titel+' '+rechnung.nr+' zu Vertrag '+vnr,
    ['Guten Tag,', 'anbei erhalten Sie die '+titel+' '+rechnung.nr+' für '+kunde.name+' zum Vertrag '+vnr+'. Fälligkeit und Zahlungsdaten finden Sie auf der Rechnung.','Viele Grüße\n'+hk.name], [beleg])
  return { version:1, automatisch:mailKonfiguriert(), von:process.env.EMAIL_FROM || '', antwortAn:hk.mail, nachrichten }
}

function statusDatei(ablage,rec,rolle,erfolg) {
  return path.join(ablage.dir,'vertraege',rec.vnr,'versand-'+rolle+(erfolg?'-angenommen':'-versuch')+'.json')
}
function lesen(datei) {
  try { return JSON.parse(fs.readFileSync(datei,'utf8')) }
  catch(e) { if(e.code==='ENOENT')return null; throw e }
}
function schreiben(datei,wert) {
  const temp=datei+'.'+randomUUID()+'.tmp'
  fs.writeFileSync(temp,JSON.stringify(wert),{mode:0o600})
  fs.renameSync(temp,datei)
}
export function versandstand(ablage,rec,rolle) {
  if(!rec.versandplan?.nachrichten[rolle])return null
  return lesen(statusDatei(ablage,rec,rolle,true)) || lesen(statusDatei(ablage,rec,rolle,false))
    || {status:rec.versandplan.automatisch?'offen':'postausgang'}
}

// Resend hält Idempotenzschlüssel 24 Stunden. Bei unklarem Ausgang danach manuell abgleichen.
const sicheresFenster=23*3600_000
export async function zustellen(ablage,rec,transport=senden,jetzt=Date.now()) {
  const plan=rec?.versandplan
  if(plan?.version!==1 || !plan.automatisch || !mailKonfiguriert())return
  for(const [rolle,mail] of Object.entries(plan.nachrichten)){
    const alt=versandstand(ablage,rec,rolle)
    if(['angenommen','pruefen','fehler'].includes(alt.status))continue
    const datei=statusDatei(ablage,rec,rolle,false)
    if(jetzt-Date.parse(rec.angelegt)>=sicheresFenster){
      schreiben(datei,{status:'pruefen',grund:'Zeitfenster für automatische Wiederholungen abgelaufen.'})
      continue
    }
    if(alt.naechsterVersuch>jetzt)continue
    const anhaenge=mail.anhaenge.map(a=>({name:a.name,buf:fs.readFileSync(ablage.datei(rec.vnr,a.datei))}))
    try {
      const id=await transport({...mail,anhaenge,von:plan.von,antwortAn:plan.antwortAn,schluessel:'vertrag/'+rec.pdfHash+'/'+rolle})
      schreiben(statusDatei(ablage,rec,rolle,true),{status:'angenommen',id})
    } catch(e) {
      const wiederholen=e.wiederholen!==false
      schreiben(datei,{status:wiederholen?'offen':'fehler',grund:String(e.message).slice(0,300),
        ...(wiederholen?{naechsterVersuch:jetzt+120000}:{})})
    }
  }
}
