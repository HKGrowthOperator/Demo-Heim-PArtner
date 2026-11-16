// Persönliche Freigabe einer Angebotsfassung oder eines ausdrücklich begrenzten Wahlrahmens.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {crc32,inflateSync} from 'node:zlib'
import { esc, eur2, datum, uhrzeit } from './dokumente.mjs'
import { vertragslink } from './angebot.mjs'

const fehler = (status, text) => Object.assign(new Error(text), {status})
const hash = text => crypto.createHash('sha256').update(text).digest('hex')
const erklaerung = {
  genau: 'Für HK gebe ich dieses Angebot an die Heim & Partner Immobilien GmbH mit der hier hinterlegten Leistungsauswahl, den Preisen und dem Zahlungsplan zur einmaligen Annahme frei. Meine Unterschrift gehört zu diesen Vertragsunterlagen.',
  wahlrahmen: 'Für HK biete ich der Heim & Partner Immobilien GmbH den Grundumfang verbindlich zur einmaligen Annahme an. Bei ihrer Annahme darf die Kundin ausschließlich die von mir ausgewählten Erweiterungen bis zu den angegebenen Höchstmengen sowie einen der freigegebenen Zahlungspläne wählen. Es gelten die hier aufgeführten Preise, Betreuungskosten und unveränderten Vertragsunterlagen.',
}
const planName = n => n ? '50 % bei Auftrag, Rest in '+n+' Monatsraten ab Auftrag' : '50 % bei Auftrag, 50 % nach Gesamtabnahme'
const gleich = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const istStand = id => typeof id==='string' && /^[0-9a-f]{48}$/.test(id)

export function geheimnisPasst(text, soll) {
  if (typeof text!=='string' || text.length<32 || text.length>256 || !/^[a-f0-9]{64}$/.test(soll || '')) return false
  return crypto.timingSafeEqual(Buffer.from(hash(text),'hex'),Buffer.from(soll,'hex'))
}
function jsonLesen(datei) {
  try { return JSON.parse(fs.readFileSync(datei,'utf8')) }
  catch (e) { if(e.code==='ENOENT')return null; throw e }
}
// Die fertige Datei erscheint auf einmal; auch zwei Serverprozesse können sie nur einmal anlegen.
function einmal(datei, daten) {
  const temp=datei+'.'+crypto.randomUUID()+'.tmp'
  fs.writeFileSync(temp,JSON.stringify(daten),{flag:'wx',mode:0o600})
  try { fs.linkSync(temp,datei);return true }
  catch(e){if(e.code==='EEXIST')return false;throw e}
  finally{fs.unlinkSync(temp)}
}
function textFeld(v, min, max) {
  if(typeof v!=='string')return null
  const text=v.trim().replace(/\s+/g,' ')
  return text.length>=min && text.length<=max ? text : null
}
function signaturPruefen(wert) {
  if(typeof wert!=='string' || wert.length>800100 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(wert))return null
  const raw=Buffer.from(wert.slice(22),'base64')
  if(raw.length<250||raw.length>600000||raw.subarray(0,16).toString('hex')!=='89504e470d0a1a0a0000000d49484452')return null
  const w=raw.readUInt32BE(16),h=raw.readUInt32BE(20)
  if(w<30||w>4096||h<15||h>2048||w*h>2_500_000||raw[24]!==8||![2,6].includes(raw[25])||raw[26]||raw[27]||raw[28])return null
  const teile=[]
  for(let pos=8;pos<raw.length;){
    if(pos+12>raw.length)return null
    const n=raw.readUInt32BE(pos),ende=pos+12+n
    if(ende>raw.length||crc32(raw.subarray(pos+4,ende-4))!==raw.readUInt32BE(ende-4))return null
    const typ=raw.toString('ascii',pos+4,pos+8)
    if(typ==='IDAT')teile.push(raw.subarray(pos+8,ende-4))
    if(typ==='IEND'&&(n!==0||ende!==raw.length))return null
    pos=ende
  }
  if(!teile.length||raw.subarray(-8).toString('hex')!=='49454e44ae426082')return null
  const kan=raw[25]===6?4:3,breite=w*kan
  let scan
  try{scan=inflateSync(Buffer.concat(teile),{maxOutputLength:(breite+1)*h})}catch{return null}
  if(scan.length!==(breite+1)*h)return null
  let tinte=0,papier=0
  for(let y=0;y<h;y++){
    const start=y*(breite+1)+1,filter=scan[start-1]
    if(filter>4)return null
    for(let j=0;j<breite;j++){
      const i=start+j,l=j>=kan?scan[i-kan]:0,o=y?scan[i-breite-1]:0,lo=y&&j>=kan?scan[i-breite-1-kan]:0
      const p=l+o-lo,dl=Math.abs(p-l),do_=Math.abs(p-o),dlo=Math.abs(p-lo)
      const f=[0,l,o,(l+o)>>1,dl<=do_&&dl<=dlo?l:do_<=dlo?o:lo][filter]
      scan[i]=(scan[i]+f)&255
      if(j%kan===kan-1){
        const k=i-kan+1,alpha=kan===3?255:scan[k+3]
        if(alpha>80&&Math.min(scan[k],scan[k+1],scan[k+2])<195)tinte++;else papier++
      }
    }
    if(tinte>14&&papier>14)return raw
  }
  return null
}
function ladeOptionen(kat) {
  return kat.add.map(a=>({id:a.id,name:a.name,text:a.text,preis:a.preis,monat:a.monat,max:a.menge?50:1,anfrage:a.art===-1,website:a.art===1}))
}
export function zeichnungsablage({dir,einladung,angebote,kat,bindung}) {
  const ordner=path.join(dir,'zeichnung')
  fs.mkdirSync(ordner,{recursive:true,mode:0o700})
  const optionen=ladeOptionen(kat), nameAnbieter=einladung.name || 'Luis Kummer'
  const freigabeStand=hash(JSON.stringify([bindung,erklaerung,optionen,kat.websiteExtraMonat,einladung.standSha256,nameAnbieter]))
  let basisKennung=null
  function basisId(){
    if(!basisKennung){
      const datei=fs.readdirSync(path.join(dir,'angebote')).find(name=>name.endsWith('.json') && istStand(name.slice(0,-5)) && hash(name.slice(0,-5))===einladung.standSha256)
      if(!datei)throw fehler(503,'Der Ausgangsstand der Freigabe ist noch nicht verfügbar.')
      basisKennung=datei.slice(0,-5)
    }
    return basisKennung
  }
  const pruefeBasis=()=>{
    const basis=angebote.lesen(basisId())
    if(basis.bindung!==bindung||basis.nr!==kat.nr)
      throw fehler(409,'Die Vertragsfassung hat sich geändert. Eine neue Einladung ist erforderlich.')
    return basis
  }
  const key=hash('HK:'+einladung.standSha256), datei=path.join(ordner,key+'.json')
  const reserviert=path.join(ordner,key+'-vertragsnummer.json')
  const lese=()=>jsonLesen(datei)
  const objekt=sign=>({name:sign.name,zeitpunkt:sign.zeitpunkt,modus:sign.modus})
  return {
    basisId,
    authentisieren(geheimnis) {
      if(!geheimnisPasst(geheimnis,einladung.sha256)) throw fehler(403,'Dieser persönliche Link ist ungültig.')
      if(!Number.isFinite(Date.parse(einladung.ablauf))||Date.now()>=Date.parse(einladung.ablauf))throw fehler(410,'Dieser persönliche Link ist abgelaufen.')
    },
    rahmen(geheimnis,abschlussVorhanden) {
      if(!geheimnisPasst(geheimnis,einladung.moderationSha256))throw fehler(403,'Bitte den persönlichen Moderationslink öffnen.')
      if(!Number.isFinite(Date.parse(einladung.ablauf))||Date.now()>=Date.parse(einladung.ablauf))throw fehler(410,'Der Moderationslink ist abgelaufen.')
      const sign=lese(), aktuell=sign?.bindung===bindung, nr=jsonLesen(reserviert)?.vnr
      return {unterzeichnet:aktuell,modus:aktuell?sign.modus:null,optionen:aktuell?sign.grenzen:{},
        zahlungsplaene:aktuell?sign.zahlungsplaene:[],abgeschlossen:!!nr&&abschlussVorhanden(nr)}
    },
    details() {
      const basis=pruefeBasis(), bereits=lese()
      return {stand:basisId(),bindung:freigabeStand,ablauf:einladung.ablauf,nr:kat.nr,kunde:kat.kunde.name,hk:kat.hk.name,basis:basis.c.net,betreuung:basis.c.mon,
        angebot:'/angebot/?stand='+basisId(),vertrag:vertragslink(basis,basisId()),optionen,zahlungsplaene:[0,3,4],websitePauschale:kat.websiteExtraMonat,
        erklaerung,vorgesehenerName:nameAnbieter,unterzeichnet:!!bereits,...bereits?objekt(bereits):{}}
    },
    freigeben(b, jetzt=new Date()) {
      const basis=pruefeBasis()
      if(lese())throw fehler(409,'Luis hat seine Freigabe bereits gespeichert.')
      if(!b || b.bindung!==freigabeStand || !Object.hasOwn(erklaerung,b.modus))throw fehler(409,'Bitte die aktuelle Fassung neu öffnen.')
      const name=textFeld(b.name,3,120),funktion=textFeld(b.funktion,2,80),ort=textFeld(b.ort,2,80),bild=signaturPruefen(b.signatur)
      if(name?.toLocaleLowerCase('de')!==nameAnbieter.toLocaleLowerCase('de')||!funktion||!ort||!bild||b.zustimmung!==true||b.vertretungsberechtigt!==true)throw fehler(422,'Bitte Namen, Funktion, Ort, Unterschrift und beide Bestätigungen prüfen.')
      let grenzen={...basis.addons}, plaene=[basis.raten]
      if(b.modus==='wahlrahmen') {
        if(!b.optionen || typeof b.optionen!=='object'||Array.isArray(b.optionen) || !Array.isArray(b.zahlungsplaene)||!b.zahlungsplaene.length||b.zahlungsplaene.some(n=>![0,3,4].includes(n)))throw fehler(422,'Bitte den Wahlrahmen und mindestens einen Zahlungsplan auswählen.')
        grenzen={}
        for(const [id,max] of Object.entries(b.optionen)){
          const opt=optionen.find(o=>o.id===id)
          if(!opt || !Number.isInteger(max)||max<1||max>opt.max)throw fehler(422,'Die freigegebene Menge oder Erweiterung ist ungültig.')
          grenzen[id]=max
        }
        plaene=[...new Set(b.zahlungsplaene)].sort((a,c)=>a-c)
      }
      const beweis={stand:basisId(),bindung,freigabeStand,nr:kat.nr,kunde:kat.kunde.name,hk:kat.hk.name,basis:basis.basis,betreuung:basis.betreuung,
        gueltig:kat.gueltig,modus:b.modus,erklaerung:erklaerung[b.modus],grenzen,optionen:optionen.filter(o=>grenzen[o.id]),
        websitePauschale:kat.websiteExtraMonat,zahlungsplaene:plaene,name,funktion,ort,zeitpunkt:jetzt.toISOString(),signaturHash:hash(bild)}
      const sign={...beweis,referenz:hash(JSON.stringify(beweis)),bild:'data:image/png;base64,'+bild.toString('base64')}
      if(!einmal(datei,sign))throw fehler(409,'Luis hat seine Freigabe bereits gespeichert.')
      return {unterzeichnet:true,...objekt(sign)}
    },
    reserviereNummer(neu) {
      const alt=jsonLesen(reserviert)
      if(alt)return alt.vnr
      const vnr=neu()
      return einmal(reserviert,{vnr})?vnr:jsonLesen(reserviert).vnr
    },
    vertragsnummer() { return jsonLesen(reserviert)?.vnr || null },
    moderiert(id,stand) { return istStand(id) && !!stand && stand.bindung===bindung && (id===basisId() || stand.hkModeration===key) },
    passend(id, stand) {
      if(!istStand(id)||!stand||stand.bindung!==bindung||(id!==basisId() && stand.hkModeration!==key))return null
      const sign=lese()
      if(!sign||sign.bindung!==bindung||sign.nr!==stand.nr||!sign.zahlungsplaene.includes(stand.raten))return null
      if(sign.modus==='genau'&&!gleich(sign.grenzen,stand.addons))return null
      if(Object.entries(stand.addons).some(([id,menge])=>!Object.hasOwn(sign.grenzen,id)||menge>sign.grenzen[id]))return null
      return sign
    },
    markiere(stand,geheimnis) { if(geheimnisPasst(geheimnis,einladung.moderationSha256))stand.hkModeration=key },
  }
}

// Die tatsächliche HK-Signatur steht bei ihrer eigenen Erklärung. Beim Wahlrahmen bleibt sichtbar,
// welche Bedingungen Luis vorab freigegeben und welche Variante die Kundin später angenommen hat.
export function signierteFassung(html, freigabe, opt, mitBild) {
  if(!freigabe)return html
  const s=freigabe, d=new Date(s.zeitpunkt), rahmen=s.modus==='wahlrahmen'
  const opts=s.optionen.map(o=>'<li>'+esc(o.name)+' · '+(o.anfrage?'separate Angebotsanfrage':eur2(o.preis)+' einmalig, '+eur2(o.monat)+' monatlich je Einheit')+' · höchstens '+s.grenzen[o.id]+'</li>').join('')
  const erk='<section class="protokoll"><h2>Freigabe des Auftragnehmers</h2><p>'+esc(s.erklaerung)+'</p><p>Grundangebot '+esc(s.nr)+': '+eur2(s.basis)+' netto einmalig, '+eur2(s.betreuung)+' netto monatlich ab Livegang.</p>'+
    (opts?'<p>Freigegebene Erweiterungen:</p><ul>'+opts+'</ul>':'<p>Keine Erweiterungen freigegeben.</p>')+
    (s.optionen.some(o=>o.website)?'<p>Mit Website-Erweiterungen fällt die zusätzliche Betreuung einmal mit '+eur2(s.websitePauschale)+' netto monatlich an.</p>':'')+
    '<p>Zahlung: '+s.zahlungsplaene.map(planName).map(esc).join(' oder ')+'</p><p>Gültig bis '+esc(s.gueltig)+'. Maßgebend sind die im Vertrag festgehaltenen Leistungen und Konditionen. Gesprächsplanung und Modellrechnungen ändern diesen Vertrag nicht.</p>'+
    '<p>Freigegebener Ausgangsstand '+esc(s.stand.slice(0,12))+'. Von der Kundin gewählte Fassung '+esc(opt.angebotsstand.slice(0,12))+'. Die vereinbarten Beträge und gegebenenfalls gewählten Erweiterungen stehen in Anlage 8.</p>'+
    '<p>'+esc(s.name)+', '+esc(s.funktion)+' für '+esc(s.hk)+' · '+esc(s.ort)+', '+datum(d)+' um '+uhrzeit(d)+' Uhr.</p>'+
    (mitBild?'<p><img alt="Persönliche Unterschrift von '+esc(s.name)+'" style="width:45mm;height:16mm;object-fit:contain" src="'+s.bild+'"></p>':'')+
    '<p class="xs">Referenz der HK-Freigabe: '+s.referenz+'</p></section>'
  const merk='Ausstellerin des Angebots '+esc(s.nr)+' vom '
  if(!html.includes(merk))throw Error('Unterschriftsbereich der Vertragsvorlage hat sich geändert.')
  const ersetzt=html.replace(merk,(rahmen?'Persönliche Vorabfreigabe des Wahlrahmens':'Persönlich vorab gezeichnet')+' durch '+esc(s.name)+' am '+datum(d)+'. Siehe HK-Freigabe. Angebot vom ')
  return ersetzt.includes('</main>') ? ersetzt.replace('</main>',()=>erk+'</main>') : ersetzt+erk
}
