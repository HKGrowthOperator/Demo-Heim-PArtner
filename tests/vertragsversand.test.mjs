import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { speicher } from '../server/speicher.mjs'
import { versandplan, versandstand, zustellen } from '../server/vertragsversand.mjs'
import { senden } from '../server/mail.mjs'

function vertrag(rechnungEmail=''){
  return {vnr:'HKG-V-2026-0010',angelegt:new Date().toISOString(),unterzeichner:{name:'Testperson',email:'zeichnung@example.invalid'},rechnungEmail,
    abrechnungsstand:{kunde:{name:'Testfirma'},hk:{name:'Testanbieter',mail:'service@example.invalid'}},
    pdfHash:'abc123',summe:{net:79900,mon:1590},rechnung:{nr:'TEST-RE-1',art:'anzahlung',brutto:47540.50}}
}
const intern=['anbieter@example.invalid'],freigabe='https://betrieb.example.invalid/intern'
test('Kunde und HK bekommen den gleichen Vertrag. Eine gesonderte Buchhaltung erhält nur die Rechnung.',()=>{
  const r=vertrag('buchhaltung@example.invalid'),plan=versandplan(r,intern,freigabe)
  const auftraege=plan.nachrichten
  assert.deepEqual(auftraege.kunde.an,['zeichnung@example.invalid'])
  assert.deepEqual(auftraege.hk.an,intern)
  assert.deepEqual(auftraege.rechnung.an,['buchhaltung@example.invalid'])
  assert.deepEqual(auftraege.hk.anhaenge,auftraege.kunde.anhaenge)
  assert.deepEqual(auftraege.hk.anhaenge.map(a=>a.datei),['vertrag.pdf'])
  assert.deepEqual(auftraege.rechnung.anhaenge.map(a=>a.datei),['rechnung.pdf'])
  assert.ok(auftraege.hk.text.includes(freigabe))
  for(const m of [auftraege.kunde,auftraege.rechnung])assert.ok(!m.text.includes(freigabe)&&!m.html.includes(freigabe))
  for(const mail of ['',r.unterzeichner.email.toUpperCase()]){
    const auftraege=versandplan(vertrag(mail),intern,freigabe).nachrichten
    assert.deepEqual(auftraege.kunde.anhaenge.map(a=>a.datei),['vertrag.pdf','rechnung.pdf'])
    assert.equal(auftraege.rechnung,undefined)
    assert.deepEqual(auftraege.hk.anhaenge.map(a=>a.datei),['vertrag.pdf'])
  }
})
test('HTTP-Versand mit Prüfpostfächern bleibt bei Abbruch, Wiederholung und Neustart eindeutig',async t=>{
  const empfang=new Map(),versuche=[]
  let abbruch=true
  const server=http.createServer(async(req,res)=>{
    const teile=[];for await(const x of req)teile.push(x)
    const key=req.headers['idempotency-key'],body=JSON.parse(Buffer.concat(teile).toString())
    assert.ok(body.to.every(x=>x.endsWith('@example.invalid')))
    assert.equal(req.url,'/emails')
    if(empfang.has(key))assert.deepEqual(body,empfang.get(key))
    else empfang.set(key,body)
    versuche.push(key)
    if(abbruch){abbruch=false;res.destroy();return}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'test-'+key}))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const env={RESEND_API_KEY:'synthetisch',EMAIL_FROM:'post@example.invalid',RESEND_API_URL:'http://127.0.0.1:'+server.address().port+'/emails'}
  const alt=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]))
  Object.assign(process.env,env)
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const [k,v] of Object.entries(alt)){if(v===undefined)delete process.env[k];else process.env[k]=v}})
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heim-vertragsversand-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const a=speicher(dir),r=vertrag('buchhaltung@example.invalid')
  const jetzt=Date.now()
  r.versandplan=versandplan(r,intern,freigabe)
  a.ablegenEinmalig(r.vnr,{'vertrag.pdf':Buffer.from('Testvertrag'),'rechnung.pdf':Buffer.from('Testrechnung')},r)
  await zustellen(a,r,senden,jetzt)
  assert.equal(versandstand(a,r,'kunde').status,'offen')
  assert.equal(versandstand(a,r,'hk').status,'angenommen')
  assert.equal(versandstand(a,r,'rechnung').status,'angenommen')
  const nachNeustart=speicher(dir)
  await zustellen(nachNeustart,nachNeustart.record(r.vnr),senden,jetzt+121000)
  await zustellen(nachNeustart,r,senden,jetzt+122000)
  assert.equal(versandstand(a,r,'kunde').status,'angenommen')
  assert.equal(empfang.size,3);assert.equal(versuche.length,4)
  const kunde=empfang.get('vertrag/abc123/kunde'),hk=empfang.get('vertrag/abc123/hk'),rg=empfang.get('vertrag/abc123/rechnung')
  assert.deepEqual(kunde.attachments,hk.attachments);assert.equal(Buffer.from(kunde.attachments[0].content,'base64').toString(),'Testvertrag')
  assert.equal(rg.attachments.length,1);assert.equal(Buffer.from(rg.attachments[0].content,'base64').toString(),'Testrechnung')
  assert.equal(rg.cc,undefined);assert.equal(rg.reply_to,'service@example.invalid')
  let n=0
  await zustellen(a,{...r,versandplan:undefined},()=>++n)
  await zustellen(a,{...r,versandplan:{...r.versandplan,automatisch:false}},()=>++n)
  assert.equal(n,0)
  const altvertrag={...r,vnr:'HKG-V-2026-0011',angelegt:new Date(jetzt-24*3600000).toISOString()}
  a.ablegenEinmalig(altvertrag.vnr,{},altvertrag)
  await zustellen(a,altvertrag,()=>++n,jetzt);assert.equal(versandstand(a,altvertrag,'kunde').status,'pruefen');assert.equal(n,0)
})
