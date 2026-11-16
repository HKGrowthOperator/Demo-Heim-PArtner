import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pruefeVertragsablage} from '../server/vertragsablage.mjs'

test('Zeichnungen erfordern einen lesbaren echten Mount und genau die vereinbarte Grundfassung auch nach einem Austausch',t=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vertrags ablage-')))
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const ordner=path.join(dir,'angebote'),id='a'.repeat(48),datei=path.join(ordner,id+'.json'),inhalt={preis:79900}
  fs.mkdirSync(ordner);fs.writeFileSync(datei,JSON.stringify(inhalt,null,2))
  const wert=crypto.createHash('sha256').update(JSON.stringify(inhalt)).digest('hex')
  const pfad=dir.replaceAll(' ','\\040'),valid='99 12 8:1 /volumes/kunden/_data '+pfad+' rw,nosuid - ext4 /dev/sda2 rw'
  const check=info=>pruefeVertragsablage(dir,()=>id,wert,()=>info)
  assert.equal(check(valid),true)
  assert.equal(check('21 12 8:1 / / rw - ext4 /dev/sda1 rw'),false)
  assert.equal(check(valid.replace(' rw,nosuid',' ro,nosuid')),false)
  assert.equal(check(valid.replace('ext4','tmpfs')),false)
  assert.equal(check(valid+'\n'+valid.replace('99 12','100 12').replace('ext4','tmpfs')),false)
  fs.writeFileSync(datei,JSON.stringify({preis:79901}));assert.equal(check(valid),false)
  fs.unlinkSync(datei);assert.equal(check(valid),false)
  const ersatz=path.join(dir,'kopie.json');fs.writeFileSync(ersatz,JSON.stringify(inhalt));fs.symlinkSync(ersatz,datei);assert.equal(check(valid),false)
})
