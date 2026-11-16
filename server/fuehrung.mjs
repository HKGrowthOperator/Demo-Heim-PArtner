// Eine bewusst gestartete Führung teilt nur die im Programm bekannten Ansichten und Zahlen.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { geheimnisPasst } from './zeichnung.mjs'

const routeNamen='cockpit freigaben vergabe neu nu quali portal projekt crm lead objekt events kanaele team auto leistung konfig roi'.split(' ')
const gezielt=(wert,moeglich,standard)=>moeglich.includes(wert)?wert:standard
const zahl=(wert,max,standard=0)=>Number.isFinite(wert)&&wert>=0&&wert<=max?wert:standard
const stufe=(wert,min,max,standard)=>Number.isInteger(wert)&&wert>=min&&wert<=max?wert:standard
const identisch=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&a===b
export function sichtbarerStand(eingabe,modell) {
  const e=eingabe||{}
  const istProduktseite=routeNamen.includes(e.seite)
  const auswahl=Object.fromEntries(modell.ADD.filter(a=>e.auswahl?.[a[0]]>0).map(a=>[a[0],a[6]?stufe(e.auswahl[a[0]],1,50,1):1]))
  const rollen=Object.fromEntries(modell.AREA.map(([k,,,n,s,r])=>[k,{n:zahl(e.rollen?.[k]?.n,1e6,n),s:zahl(e.rollen?.[k]?.s,1e6,s),r:zahl(e.rollen?.[k]?.r,1e6,r)}]))
  return {seite:istProduktseite?e.seite:'cockpit',station:istProduktseite?stufe(e.station,-1,35,-1):-1,kurz:e.kurz!==false,tid:gezielt(e.tid,['t1','t2','t3','t4'],'t1'),
    ttab:gezielt(e.ttab,['bieter','vergleich','vergabe','einlesen'],'bieter'),
    ptab:gezielt(e.ptab,['uebersicht','schrift','tagebuch','maengel','budget','docs'],'uebersicht'),
    person:gezielt(e.person,['dennis','lorenz','schuster','wagner','neumann','krause','becker','richter'],'dennis'),
    nuTab:gezielt(e.nuTab,['ranking','stamm','akquise'],'ranking'),neuSchritt:stufe(e.neuSchritt,0,3,0),
    wfTab:gezielt(e.wfTab,['agents','flows','rules'],'agents'),
    ana:gezielt(e.ana,['idle','run','done'],'idle'),fertig:e.fertig===true,vergeben:e.vergeben===true,
    zusammenfassung:e.zusammenfassung===true,auswahl,rollen,wirkung:zahl(e.wirkung,100,100),raten:gezielt(e.raten,[0,3,4],0),
    angebot:typeof e.angebot==='string'&&/^[0-9a-f]{48}$/.test(e.angebot)?e.angebot:null}
}
export function liveDienst({dir,einladung,modell,lesen,json,berechtigteFassung}){
  const datei=path.join(dir,'aktuelle-fuehrung.json'),tmp=datei+'.tmp'
  let z=null
  try{z=JSON.parse(fs.readFileSync(datei,'utf8'))}catch(err){if(err.code!=='ENOENT')throw err}
  const speichern=wert=>{fs.writeFileSync(tmp,JSON.stringify(wert),{mode:0o600});fs.renameSync(tmp,datei);z=wert}
  // Auch ein bereits geteilter Zuschauerlink öffnet nur noch eine gültige Produktansicht.
  if(z?.stand){
    const stand=sichtbarerStand(z.stand,modell)
    if(JSON.stringify(stand)!==JSON.stringify(z.stand))speichern({...z,stand,rev:z.rev+1,zeit:Date.now()})
  }
  const neu=()=>crypto.randomBytes(24).toString('hex')
  const fehler=(status,text)=>Object.assign(Error(text),{status})
  const aktiv=()=>z?.bis>Date.now()
  return async function liveAnfrage(req,res,url){
    if(!url.pathname.startsWith('/api/fuehrung/'))return false
    const aktion=url.pathname.slice('/api/fuehrung/'.length)
    if(aktion==='zuschauen'&&req.method==='GET'){
      if(!aktiv()||!identisch(req.headers['x-hp-zuschauer'],z.lesen))throw fehler(410,'Diese Führung ist beendet.')
      json(res,200,{stand:z.stand,revision:z.rev,geaendert:z.zeit});return true
    }
    const token=String(req.headers['x-hk-moderation']||req.headers.authorization||'').replace(/^Bearer /,'')
    if(!geheimnisPasst(token,einladung.moderationSha256)||Date.parse(einladung.ablauf)<Date.now())throw fehler(403,'Bitte den persönlichen Moderationslink öffnen.')
    if(aktion==='status'&&req.method==='GET'){json(res,200,{aktiv:aktiv()===true});return true}
    if(req.method!=='POST'||!['start','stand','ende'].includes(aktion))throw fehler(404,'Unbekannte Aktion.')
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fehler(415,'JSON erforderlich.')
    const b=await lesen(req,12000)
    if(aktion==='start'){
      if(aktiv()&&b.uebernehmen!==true)throw fehler(409,'Eine Führung ist bereits aktiv. Zum Wechsel bitte ausdrücklich übernehmen.')
      const lesen=aktiv()?z.lesen:neu(),schreiben=neu(),stand=sichtbarerStand(b.stand,modell);stand.angebot=null
      speichern({lesen,schreiben,rev:1,stand,bis:Math.min(Date.now()+6*3600000,Date.parse(einladung.ablauf)),zeit:Date.now()})
      json(res,201,{lesen,schreiben});return true
    }
    if(!aktiv()||!identisch(b.schreiben,z.schreiben))throw fehler(409,'Diese Moderation läuft in einem anderen Fenster oder ist beendet.')
    if(aktion==='ende'){speichern(null);json(res,200,{beendet:true});return true}
    const stand=sichtbarerStand(b.stand,modell)
    if(stand.angebot&&!berechtigteFassung(stand.angebot))throw fehler(400,'Dieser Angebotsstand ist für die Führung nicht freigegeben.')
    if(JSON.stringify(stand)!==JSON.stringify(z.stand))speichern({...z,stand,rev:z.rev+1,zeit:Date.now()})
    json(res,200,{revision:z.rev});return true
  }
}
