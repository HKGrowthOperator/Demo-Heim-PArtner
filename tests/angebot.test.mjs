import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { angebotModell, archiv, dokument, fassung, verbindungPruefen, vertragsbindung, vertragslink } from '../server/angebot.mjs'
import { abrechnungsstand, abrechnungFuer, schlussrechnungHtml, vertragsinhalt, HK_VORAB } from '../server/dokumente.mjs'
const kat=JSON.parse(fs.readFileSync(new URL('../server/vorlage/katalog.json',import.meta.url)))
const modell=angebotModell(new URL('../site/index.html',import.meta.url))

test('Preis, volle Teamzeit und Umfang des Grundangebots sind gemeinsam nachvollziehbar',()=>{
 const s=fassung(kat,modell)
 assert.equal(s.c.net,79900);assert.equal(s.c.mon,1590);assert.equal(s.h,2692);assert.equal(s.zeitwert,148060)
 assert.equal(s.umfang.length,20);assert.deepEqual(s.plan.map(p=>p.netto),[39950,39950])
 assert.equal(dokument(s),fs.readFileSync(new URL('../site/angebot/index.html',import.meta.url),'utf8'))
})
test('Fassung überlebt neue Sitzung und Serverstart und bindet Rollen, Erweiterungen und Zahlungsplan',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-angebot-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const s=fassung(kat,modell,{gespraechFreigabe:true,raten:3,addons:{zu:3,ib:1},roi:{tf:50,a:{gf:{n:2,s:3,r:70}}},gespraech:{startprojekt:'Bauprojekt <privat>',verantwortlich:'Beispiel',wunschstart:'2026-12-01',intern:'vertraulich'}})
 const id=archiv(dir).speichern(s), neu=archiv(dir).lesen(id);assert.deepEqual(neu,s)
 assert.match(id,/^[a-f0-9]{48}$/);const link=vertragslink(neu,id);assert.ok(!link.includes('privat'));assert.match(link,/vertrag-raten/);assert.match(link,/raten=3/)
 assert.ok(!JSON.stringify(neu).includes('vertraulich'));assert.match(dokument(neu,id),/Bauprojekt &lt;privat&gt;/)
 assert.equal(neu.rollen[0].h,156);assert.equal(neu.rollen[0].zeitwert,10920)
 assert.equal(neu.plan.length,4);assert.equal(Math.round(neu.plan.reduce((sum,r)=>sum+r.netto,0)*100),neu.c.net*100)
 assert.doesNotThrow(()=>verbindungPruefen(kat,neu,s.addons,3,'raten',neu.bindung))
 for(const auswahl of [{...s.addons,zu:1},{}])assert.throws(()=>verbindungPruefen(kat,neu,auswahl,3,'raten',neu.bindung),{status:409})
 assert.throws(()=>verbindungPruefen(kat,neu,s.addons,0,'standard',neu.bindung),{status:409})
 assert.throws(()=>archiv(dir).lesen('fehlend'),{status:404})
})
test('Vertragspartei, neutrale Unterzeichnung, Leistungsgrenzen und Fassung sind dieselben im Vertragsdokument',()=>{
 const s=fassung(kat,modell),html=vertragsinhalt(kat,s.c,{gf:'Frank Heim'},null,{angebotsstand:'a'.repeat(48)})
 assert.match(html,/Heim &amp; Partner Immobilien GmbH/);assert.match(html,/HRB 106755/);assert.match(html,/Angebotsfassung aaaaaaaaaaaa/)
 assert.doesNotMatch(html,/Website Vertrieb einzeln|11\.900 €|72\.400 €|Software Premium|einer der genannten Geschäftsführer/)
 assert.match(html,/3\.000 € netto/);assert.match(html,/120 € netto/);assert.equal(kat.vorbelegt.unterzeichner.length,0)
 assert.equal(HK_VORAB,null)
})

test('Gesprächs- und Startdaten benötigen eine eigene ausdrückliche Freigabe',()=>{
 const gespraech={gespraechsziel:'Unser internes Ziel',startprojekt:'Vertraulicher Projektname',praxisstunden:21}
 for(const freigabe of [undefined, false, 'true']){
  const s=fassung(kat,modell,{freigabe:true,gespraechFreigabe:freigabe,gespraech})
  assert.deepEqual(s.gespraech,{})
  assert.doesNotMatch(dokument(s),/internes Ziel|Vertraulicher Projektname|Zeitgewinn im Praxisbeispiel/)
 }
 const s=fassung(kat,modell,{gespraechFreigabe:true,gespraech})
 assert.deepEqual(s.gespraech,gespraech)
})

test('Schlussrechnung nennt die bei Unterzeichnung verwendeten Parteien und Leistungsbezeichnung',()=>{
 const basis={vnr:'HKG-V-2026-0001',angelegt:'2026-11-12T12:00:00Z',summe:{net:79900,brutto:95081},rechnung:{nr:'TEST',netto:39950,brutto:47540.5,ust:7590.5},posten:[]}
 const datum={nr:'TEST',datum:'01.02.2027',abnahme:'01.02.2027',faellig:'15.02.2027'}
 const vorher=structuredClone(basis)
 const alt=schlussrechnungHtml(abrechnungFuer(basis),basis,datum)
 assert.match(alt.html,/HEIM &amp; PARTNER GmbH/);assert.match(alt.html,/Gesamtpaket Premium/);assert.deepEqual(basis,vorher)
 const neu={...basis,abrechnungsstand:abrechnungsstand(kat)}
 const rechnung=schlussrechnungHtml(abrechnungFuer(neu),neu,datum)
 assert.match(rechnung.html,/Heim &amp; Partner Immobilien GmbH/);assert.match(rechnung.html,/Gesamtumsetzung für Heim &amp; Partner/)
 assert.doesNotMatch(rechnung.html,/Gesamtpaket Premium/);assert.equal(rechnung.brutto,alt.brutto)
})

test('Änderungen an Vertragsparteien, Leistungsumfang, Konditionen und Vorlagen erfordern Neufreigabe',()=>{
 const s=fassung(kat,modell), neuPruefen=b=>verbindungPruefen(kat,s,s.addons,0,'standard',b)
 assert.doesNotThrow(()=>neuPruefen(vertragsbindung(kat,modell)))
 for(const bindung of [
   vertragsbindung({...kat,kunde:{...kat.kunde,str:'Neue Anschrift'}},modell),
   vertragsbindung(kat,{...modell,B:modell.B.slice(1)}),
   vertragsbindung(kat,{...modell,KOND:[['Betreuung','Geänderte Laufzeit']]}),
   vertragsbindung(kat,{...modell,NEV:[...modell.NEV,'Geänderte Leistungsgrenze']}),
   vertragsbindung(kat,modell,'Neue Vertragsvorlage')
 ]) assert.throws(()=>neuPruefen(bindung),{status:409})
 assert.match(dokument(s),/Im Rod 35/);assert.equal(s.c.net,79900)
})
