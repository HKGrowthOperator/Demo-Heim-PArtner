import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {crc32,deflateSync} from 'node:zlib'
import { archiv, angebotModell, fassung } from '../server/angebot.mjs'
import { speicher } from '../server/speicher.mjs'
import { zeichnungsablage, signierteFassung, geheimnisPasst } from '../server/zeichnung.mjs'
import { vertragsinhalt, vertragHtml } from '../server/dokumente.mjs'

const hash=s=>crypto.createHash('sha256').update(s).digest('hex')
const kat=JSON.parse(fs.readFileSync(new URL('../server/vorlage/katalog.json',import.meta.url)))
const modell=angebotModell(new URL('../site/index.html',import.meta.url))
// Rein synthetisches Testbild als eingehende Canvas-Nutzlast; nie auf einer echten Vertragsablage.
const testName='Testperson Anbieter'
function testPng(leer=false){
  const kopf=Buffer.from('89504e470d0a1a0a','hex'),ihdr=Buffer.alloc(13)
  const w=160,h=64;ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6
  const scan=Buffer.alloc((w*4+1)*h,255)
  for(let y=0;y<h;y++){scan[y*(w*4+1)]=0;if(!leer)for(let x=0;x<w;x++){
    if((x+y)%13===0)scan.fill(35,y*(w*4+1)+4*x+1,y*(w*4+1)+4*x+4)
  }}
  const chunk=(name,data)=>{const type=Buffer.from(name),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([n,type,data,crc])}
  const png=Buffer.concat([kopf,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan,{level:0})),chunk('IEND',Buffer.alloc(0))])
  return 'data:image/png;base64,'+png.toString('base64')
}
const bild=testPng()
function probe(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-zeichnung-test-'))
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const angebote=archiv(dir),basis=fassung(kat,modell),id=angebote.speichern(basis)
  const token=crypto.randomBytes(32).toString('base64url'),moderation=crypto.randomBytes(32).toString('base64url')
  const einladung={name:testName,standSha256:hash(id),sha256:hash(token),moderationSha256:hash(moderation),ablauf:'2099-12-09T12:00:00Z'}
  const stellen=()=>zeichnungsablage({dir,einladung,angebote,kat,bindung:basis.bindung})
  const z=stellen(),klar={name:testName,funktion:'Geschäftsführer',ort:'Testort',bindung:z.details().bindung,modus:'genau',zustimmung:true,vertretungsberechtigt:true,signatur:bild}
  return {z,klar,stellen,id,basis,moderation,dir,token,einladung,neuer:(payload,moderiert)=>{
    const stand=fassung(kat,modell,payload)
    if(moderiert)z.markiere(stand,moderation)
    return {stand,id:angebote.speichern(stand)}
  }}
}
test('Die Einladungskennung wird nur mit deren gültigem zeitlich begrenztem Geheimnis angenommen',t=>{
  const {z,id,token,einladung}=probe(t)
  assert.equal(z.basisId(),id)
  assert.throws(()=>z.authentisieren('kurz'),{status:403});assert.throws(()=>z.authentisieren(id),{status:403})
  z.authentisieren(token);assert.equal(geheimnisPasst(token,einladung.sha256),true)
  assert.doesNotMatch(JSON.stringify(z.details()),new RegExp(token))
  einladung.ablauf='2000-01-01T00:00:00Z';assert.throws(()=>z.authentisieren(token),{status:410})
})
test('Ohne beide Bestätigungen und Bild entsteht keine HK-Freigabe. Eine fertige Erklärung bleibt einmalig.',t=>{
  const {z,klar,id,basis,stellen,neuer}=probe(t)
  assert.equal(z.passend(id,basis),null)
  for(const teil of [{signatur:''},{signatur:testPng(true)},{name:'Andere Person'},{zustimmung:false},{vertretungsberechtigt:false},{ort:''},{bindung:'andere Fassung'}]){
    assert.throws(()=>z.freigeben({...klar,...teil}));assert.equal(z.details().unterzeichnet,false)
  }
  z.freigeben(klar);assert.throws(()=>z.freigeben(klar),{status:409});assert.equal(stellen().passend(id,basis).name,testName)
  for(const payload of [{addons:{ar:1}},{raten:3}]){
    const alt=neuer(payload,true);assert.equal(z.passend(alt.id,alt.stand),null)
  }
  const fremd=neuer({},false);assert.equal(z.passend(fremd.id,fremd.stand),null)
})
test('Wahlrahmen ist auf moderierte Auswahl, Preise, erlaubte Höchstmengen und Laufzeit der Dokumentfassung begrenzt',t=>{
  const {z,klar,neuer}=probe(t)
  for(const b of [{optionen:{unbekannt:1}},{optionen:{zu:51}},{zahlungsplaene:[12]}])assert.throws(()=>z.freigeben({...klar,modus:'wahlrahmen',optionen:{},zahlungsplaene:[0],...b}))
  z.freigeben({...klar,modus:'wahlrahmen',optionen:{ib:1,zu:3},zahlungsplaene:[0,3]})
  for(const [payload,soll] of [[{},true],[{addons:{ib:1,zu:3},raten:3},true],[{addons:{zu:4}},false],[{addons:{ar:1}},false],[{raten:4},false]]){
    const {id,stand}=neuer(payload,true);assert.equal(!!z.passend(id,stand),soll)
    assert.equal(z.passend(id,{...stand,bindung:'geändert'}),null)
  }
  const {id,stand}=neuer({addons:{ib:1}},false);assert.equal(z.passend(id,stand),null)
})
test('Der endgültige Vertragsinhalt belegt Auswahl- und HK-Referenz sowie beide Zeichnungen; Vorschau enthält keine HK-Grafik',t=>{
  const {z,klar,id,basis}=probe(t)
  z.freigeben(klar,new Date('2026-11-01T10:00:00Z'))
  const sig=z.passend(id,basis),opt={angebotsstand:id},u={name:'Testkundin',funktion:'Test',ort:'Testort',datum:'01.11.2026',uhrzeit:'12:00',signatur:'data:image/png;base64,VGVzdA=='}
  const html=vertragHtml(kat,basis.c,{}, {u,opt}).html
  const end=signierteFassung(html,sig,opt,true)
  assert.match(end,/Testkundin/);assert.ok(end.includes(u.signatur));assert.ok(end.includes(bild));assert.ok(end.includes(sig.referenz))
  assert.ok(end.includes(id.slice(0,12)));assert.ok(end.indexOf(sig.referenz)<end.indexOf('</main>'))
  assert.ok(!signierteFassung(vertragsinhalt(kat,basis.c,{}),sig,opt,false).includes(bild))
})
test('Parallel vorbereitete Abschlüsse erhalten eine Vertragsnummer und nur der zuerst gespeicherte Datensatz wird versendet',t=>{
  const {z,stellen,dir}=probe(t),sp=speicher(dir)
  assert.equal(z.reserviereNummer(()=>'HKG-V-2070-0001'),stellen().reserviereNummer(()=>{throw Error('Zusätzliche Nummer')}))
  const id=z.vertragsnummer()
  assert.equal(sp.ablegenEinmalig(id,{'vertrag.pdf':'erster Stand'},{a:1}),true)
  assert.equal(sp.ablegenEinmalig(id,{'vertrag.pdf':'anderer Stand'},{a:2}),false)
  assert.deepEqual(sp.record(id),{a:1});assert.equal(fs.readFileSync(sp.datei(id,'vertrag.pdf'),'utf8'),'erster Stand')
})

test('Nur die Moderation sieht den tatsächlich gezeichneten Rahmen bis zum Ablauf, ohne Signatur oder Kontaktdaten',t=>{
  const {z,klar,token,moderation,einladung}=probe(t)
  for(const eingang of [undefined,token])assert.throws(()=>z.rahmen(eingang,()=>false),{status:403})
  assert.deepEqual(z.rahmen(moderation,()=>false),{unterzeichnet:false,modus:null,optionen:{},zahlungsplaene:[],abgeschlossen:false})
  z.freigeben({...klar,modus:'wahlrahmen',optionen:{zu:2,ib:1},zahlungsplaene:[4,0]})
  z.reserviereNummer(()=>'TEST')
  const ist=z.rahmen(moderation,id=>id==='TEST')
  assert.deepEqual(ist,{unterzeichnet:true,modus:'wahlrahmen',optionen:{zu:2,ib:1},zahlungsplaene:[0,4],abgeschlossen:true})
  assert.equal(z.rahmen(moderation,()=>false).abgeschlossen,false)
  einladung.ablauf='2000-01-01T00:00:00Z';assert.throws(()=>z.rahmen(moderation,()=>true),{status:410})
})
