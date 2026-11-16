import { createDecipheriv } from 'node:crypto'

// Derselbe persönliche Raum wird für weitere Gespräche genutzt. Der öffentliche
// Einstieg enthält nur die Raumkennung. Den Direkteinlass öffnet der Einladungslink.
const raum = 'https://us05web.zoom.us/j/3799930721'
const versiegelt = 'L_yeDIxPriQVySXqfTU22zsstc6vKCL6CxbW4E0Yb5PVPvmDqXTTZ_9dWJLxkLE83HRq8WQ5dwM2B1jW'
export const einlassAb = Date.parse('2026-11-17T12:20:00+01:00')
export const ende = Date.parse('2026-11-17T13:30:00+01:00')

export function warteAnsicht(url) {
  if (!['/', '/index.html'].includes(url.pathname)) return false
  return !['termin', 'probe'].includes(url.searchParams.get('modus')) &&
    url.searchParams.get('mitsehen') !== '1' && !url.searchParams.has('probe')
}

export function terminZiel(einladung, jetzt = Date.now()) {
  if (jetzt < einlassAb || jetzt >= ende) return '/'
  if (!einladung) return raum
  if (!/^[a-zA-Z0-9_-]{43}$/.test(einladung)) return raum
  try {
    const paket = Buffer.from(versiegelt, 'base64url')
    const entschluesseln = createDecipheriv('aes-256-gcm', Buffer.from(einladung, 'base64url'), paket.subarray(0, 12))
    entschluesseln.setAuthTag(paket.subarray(12, 28))
    const ziel = new URL(raum)
    const kennung = Buffer.concat([entschluesseln.update(paket.subarray(28)), entschluesseln.final()]).toString('utf8')
    ziel.searchParams.set('pwd', kennung)
    return ziel.href
  } catch {
    return raum
  }
}
