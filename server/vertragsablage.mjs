// Für rechtsverbindliche Schreibvorgänge müssen sowohl der Mount als auch der bekannte Originalbestand stimmen.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const mountPfad=text=>text.replace(/\\([0-7]{3})/g,(_,oct)=>String.fromCharCode(parseInt(oct,8)))
const fluechtig=new Set(['overlay','tmpfs','ramfs','rootfs','proc','sysfs','devtmpfs'])
function gemountet(dir,info) {
  // Bei überlagerten Mounts kann ein neueres tmpfs den eigentlichen Datenträger verdecken.
  let treffer=null
  for(const zeile of info.split('\n')){
    const [links,rechts]=zeile.split(' - ')
    if(!rechts)continue
    const felder=links.split(' '), ziel=mountPfad(felder[4] || '')
    if(!ziel||ziel==='/'||(dir!==ziel&&!dir.startsWith(ziel+'/')))continue
    if(!treffer||ziel.length>treffer.ziel.length||(ziel===treffer.ziel && +felder[0]>treffer.id))
      treffer={ziel,id:+felder[0],typ:rechts.split(' ')[0],lesbarSchreibbar:(felder[5] || '').split(',').includes('rw')}
  }
  return !!treffer && treffer.lesbarSchreibbar && !fluechtig.has(treffer.typ)
}
export function pruefeVertragsablage(dir,basisId,inhaltSha256,leseMountInfo=()=>fs.readFileSync('/proc/self/mountinfo','utf8')) {
  try {
    if(!/^[0-9a-f]{64}$/.test(inhaltSha256 || ''))return false
    const ziel=fs.realpathSync(dir)
    if(!gemountet(ziel,leseMountInfo()))return false
    const id=basisId()
    if(typeof id!=='string'||!/^[0-9a-f]{48}$/.test(id))return false
    const datei=path.join(ziel,'angebote',id+'.json')
    if(fs.realpathSync(datei)!==datei || !fs.lstatSync(datei).isFile())return false
    // Der konkrete Angebotsinhalt wird bei jeder Prüfung neu gelesen. Ein früher einmal
    // verifizierter Dateiname reicht nach einem Volume-Wechsel nicht aus.
    const json=JSON.parse(fs.readFileSync(datei,'utf8'))
    return crypto.createHash('sha256').update(JSON.stringify(json)).digest('hex')===inhaltSha256
  } catch {return false}
}
