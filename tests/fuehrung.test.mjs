import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomBytes,createHash} from 'node:crypto'
import {liveDienst} from '../server/fuehrung.mjs'
const modell={ADD:[['a','Gruppe','Leistung',null,50,0,true]],AREA:[['gf','Leitung','',1,5,50]]}
test('Die Führung überträgt dieselben Schritte und Mengen; Übernahme und Beenden gelten für beide Fenster',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'hp-live-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const m=randomBytes(32).toString('hex'), stand={seite:'praes',auswahl:{a:2},raten:4,deck:{step:3,sub:2,daten:{fokus:['compare'],wochen:46,beispiele:[{id:'compare',stunden:12,bestaetigt:10,anteil:50}]}},notiz:'nur intern'}
 const einladung={moderationSha256:createHash('sha256').update(m).digest('hex'),ablauf:new Date(Date.now()+3600000).toISOString()}
 const handler=()=>liveDienst({dir,einladung,modell,lesen:r=>Promise.resolve(r.body),json:(r,status,j)=>{r.antwort=j},berechtigteFassung:id=>id==='a'.repeat(48)})
 let handle=handler()
 const run=async(action,method,header,body)=>{const res={};await handle({method,headers:{'content-type':'application/json',...header},body},res,{pathname:'/api/fuehrung/'+action});return res.antwort}
 const mod={'x-hk-moderation':'Bearer '+m}
 const raum=await run('start','POST',mod,{stand})
 const gast={'x-hp-zuschauer':raum.lesen}
 const a=await run('zuschauen','GET',gast);assert.equal(a.stand.deck.sub,2);assert.equal(a.stand.auswahl.a,2);assert.equal(a.stand.notiz,undefined);assert.ok(!('schreiben' in a))
 await assert.rejects(()=>run('stand','POST',gast,{stand,schreiben:raum.lesen}),{status:403})
 await run('stand','POST',mod,{schreiben:raum.schreiben,stand:{...stand,angebot:'a'.repeat(48)}})
 handle=handler();assert.equal((await run('zuschauen','GET',gast)).stand.angebot,'a'.repeat(48))
 await assert.rejects(()=>run('start','POST',mod,{stand}),{status:409})
 const uebernahme=await run('start','POST',mod,{uebernehmen:true,stand})
 assert.equal(uebernahme.lesen,raum.lesen);assert.notEqual(uebernahme.schreiben,raum.schreiben)
 await assert.rejects(()=>run('stand','POST',mod,{stand,schreiben:raum.schreiben}),{status:409})
 await run('ende','POST',mod,{schreiben:uebernahme.schreiben})
 await assert.rejects(()=>run('zuschauen','GET',gast),{status:410})
})
