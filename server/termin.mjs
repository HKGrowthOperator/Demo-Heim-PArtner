import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export const einlassAb = Date.parse('2026-11-18T15:20:00+01:00')
// Auch während einer Verlängerung sollen Teilnehmer wieder beitreten können.
export const einlassBis = Date.parse('2026-11-18T18:30:00+01:00')
// Der hinterlegte Zoom-Zugang bleibt bei der Terminverschiebung bestehen.
const dateiname = 'videotermin-20261117.json'
const soll = '3f9f6ae4b30fd1883539a57d02dae02679ec3fd98531bbdc40e39fe370183e50'
const pruefwert = wert => createHash('sha256').update(wert).digest('hex')

// Der Warteraum mit Uhr und Countdown ist abgeschaltet. Seine frühere Adresse führt zur Demo.
export function warteAnsicht(url) {
  return ['/termin', '/termin/', '/warteraum.html'].includes(url.pathname)
}

export function speichereTermin(dir, ziel) {
  if (typeof ziel !== 'string' || pruefwert(ziel) !== soll) {
    throw Object.assign(new Error('Die Adresse gehört nicht zum freigegebenen Termin.'), {status: 422})
  }
  const datei = path.join(dir, dateiname)
  const temp = datei + '.' + randomUUID()
  try {
    fs.writeFileSync(temp, JSON.stringify({ziel}), {mode: 0o600, flag: 'wx'})
    fs.renameSync(temp, datei)
  } finally {
    fs.rmSync(temp, {force: true})
  }
}

export function leseTermin(dir) {
  try {
    const {ziel} = JSON.parse(fs.readFileSync(path.join(dir, dateiname), 'utf8'))
    return typeof ziel === 'string' && pruefwert(ziel) === soll ? ziel : null
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function terminZiel(dir, jetzt = Date.now()) {
  if (jetzt < einlassAb || jetzt >= einlassBis) return '/'
  const ziel = leseTermin(dir)
  if (!ziel) throw Object.assign(new Error('Der Zugang zum Videogespräch ist noch nicht hinterlegt.'), {status: 503})
  return ziel
}
