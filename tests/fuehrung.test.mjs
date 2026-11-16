import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomBytes,createHash} from 'node:crypto'
import {liveDienst,sichtbarerStand} from '../server/fuehrung.mjs'
const modell={ADD:[['a','Gruppe','Leistung',null,50,0,true]],AREA:[['gf','Leitung','',1,5,50]]}
test('Die Führung überträgt dieselben Schritte und Mengen; Übernahme und Beenden gelten für beide Fenster',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'hp-live-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const m=randomBytes(32).toString('hex'), stand={seite:'vergabe',station:2,ttab:'einlesen',person:'lorenz',auswahl:{a:2},raten:4,notiz:'nur intern'}
 const einladung={moderationSha256:createHash('sha256').update(m).digest('hex'),ablauf:new Date(Date.now()+3600000).toISOString()}
 const handler=()=>liveDienst({dir,einladung,modell,lesen:r=>Promise.resolve(r.body),json:(r,status,j)=>{r.antwort=j},berechtigteFassung:id=>id==='a'.repeat(48)})
 let handle=handler()
 const run=async(action,method,header,body)=>{const res={};await handle({method,headers:{'content-type':'application/json',...header},body},res,{pathname:'/api/fuehrung/'+action});return res.antwort}
 const mod={'x-hk-moderation':'Bearer '+m}
 const raum=await run('start','POST',mod,{stand})
 const gast={'x-hp-zuschauer':raum.lesen}
 const a=await run('zuschauen','GET',gast);assert.equal(a.stand.ttab,'einlesen');assert.equal(a.stand.person,'lorenz');assert.equal(a.stand.station,2);assert.equal(a.stand.deck,undefined);assert.equal(a.stand.auswahl.a,2);assert.equal(a.stand.notiz,undefined);assert.ok(!('schreiben' in a))
 await assert.rejects(()=>run('stand','POST',gast,{stand,schreiben:raum.lesen}),{status:403})
 await run('stand','POST',mod,{schreiben:raum.schreiben,stand:{...stand,angebot:'a'.repeat(48)}})
 // Simuliert einen bereits geteilten Zuschauerlink aus einer früheren Veröffentlichung.
 const speicher=path.join(dir,'aktuelle-fuehrung.json'),alt=JSON.parse(readFileSync(speicher,'utf8'))
 Object.assign(alt.stand,{seite:'praes',station:3,deck:{step:4,daten:{fokus:['compare']}}})
 writeFileSync(speicher,JSON.stringify(alt))
 handle=handler()
 const migriert=await run('zuschauen','GET',gast)
 assert.equal(migriert.stand.seite,'cockpit');assert.equal(migriert.stand.station,-1)
 assert.ok(!('deck' in migriert.stand));assert.equal(migriert.stand.angebot,'a'.repeat(48))
 assert.equal(migriert.revision,alt.rev+1)
 handle=handler();assert.equal((await run('zuschauen','GET',gast)).revision,migriert.revision)
 await assert.rejects(()=>run('start','POST',mod,{stand}),{status:409})
 const uebernahme=await run('start','POST',mod,{uebernehmen:true,stand})
 assert.equal(uebernahme.lesen,raum.lesen);assert.notEqual(uebernahme.schreiben,raum.schreiben)
 await assert.rejects(()=>run('stand','POST',mod,{stand,schreiben:raum.schreiben}),{status:409})
 await run('ende','POST',mod,{schreiben:uebernahme.schreiben})
 await assert.rejects(()=>run('zuschauen','GET',gast),{status:410})
})

test('Produktansichten teilen nur die benannten Rollen, Reiter und Schritte',()=>{
 for(const ptab of ['uebersicht','tagebuch','maengel','budget','docs','schrift']){
  assert.equal(sichtbarerStand({seite:'projekt',ptab},modell).ptab,ptab)
 }
 const stand=sichtbarerStand({seite:'neu',neuSchritt:3,person:'schuster',nuTab:'stamm',wfTab:'rules',deck:{step:9},notiz:'privat'},modell)
 assert.equal(stand.seite,'neu');assert.equal(stand.neuSchritt,3);assert.equal(stand.person,'schuster')
 assert.equal(stand.nuTab,'stamm');assert.equal(stand.wfTab,'rules');assert.ok(!('notiz' in stand));assert.ok(!('deck' in stand))
 const fallback=sichtbarerStand({seite:'unbekannt',station:3,person:'unbekannt',neuSchritt:4,wfTab:'fremd',nuTab:'fremd'},modell)
 assert.equal(fallback.seite,'cockpit');assert.equal(fallback.station,-1);assert.equal(fallback.person,'dennis')
 assert.equal(fallback.neuSchritt,0);assert.equal(fallback.wfTab,'agents');assert.equal(fallback.nuTab,'ranking')
})
