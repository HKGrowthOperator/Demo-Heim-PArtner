// Ablage auf dem Volume (DATA_DIR): unterschriebene Verträge, Zähler für Nummern, Postausgang ohne Mailversand.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const lesen = (f, leer) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return leer } }
function schreiben(f, inhalt) {
  const tmp = f + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, inhalt)
  fs.renameSync(tmp, f)
}

export function speicher(dir) {
  for (const d of ['vertraege', 'outbox']) fs.mkdirSync(path.join(dir, d), { recursive: true })
  const zf = path.join(dir, 'zaehler.json'), nf = path.join(dir, 'nonces.json')

  return {
    dir,
    /** Nächste Nummer je Art und Jahr, z. B. ('rechnung', 2026) → 1, 2, … */
    naechste(art, jahr, start = 1) {
      const z = lesen(zf, {}), k = `${art}:${jahr}`
      z[k] = Math.max((z[k] || 0) + 1, start)
      schreiben(zf, JSON.stringify(z, null, 1))
      return z[k]
    },
    geheimnis() {
      if (process.env.DOWNLOAD_SECRET) return process.env.DOWNLOAD_SECRET
      const f = path.join(dir, '.secret')
      if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
      return fs.readFileSync(f, 'utf8').trim()
    },
    nonce(n) { return lesen(nf, {})[n] || null },
    merkeNonce(n, id) { const x = lesen(nf, {}); x[n] = id; schreiben(nf, JSON.stringify(x)) },
    ablegen(id, dateien, record) {
      const d = path.join(dir, 'vertraege', id)
      fs.mkdirSync(d, { recursive: true })
      for (const [name, buf] of Object.entries(dateien)) fs.writeFileSync(path.join(d, name), buf)
      schreiben(path.join(d, 'record.json'), JSON.stringify(record, null, 1))
    },
    nachtragen(id, felder) {
      const f = path.join(dir, 'vertraege', id, 'record.json')
      schreiben(f, JSON.stringify({ ...lesen(f, {}), ...felder }, null, 1))
    },
    record(id) { return lesen(path.join(dir, 'vertraege', id, 'record.json'), null) },
    datei(id, name) {
      const p = path.join(dir, 'vertraege', id, name)
      return fs.existsSync(p) ? p : null
    },
    postausgang(mail) {
      const f = path.join(dir, 'outbox', `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`)
      const { anhaenge = [], ...rest } = mail
      schreiben(f, JSON.stringify({ ...rest, anhaenge: anhaenge.map(a => a.name) }, null, 1))
      return f
    },
  }
}
