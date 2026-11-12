// Zahlungsplan: Standard laut Katalog (50 % bei Auftragserteilung, 50 % nach Gesamtabnahme)
// oder Ratenzahlung für den Notfall (50 % bei Auftragserteilung, Rest in 3 oder 4 gleichen Monatsraten).
import { r2 } from './preis.mjs'

export const RATEN = [3, 4]
const MONATE = ['einen Monat', 'zwei Monate', 'drei Monate', 'vier Monate']
export const monateText = n => MONATE[n - 1]

/** Zeilen { name, anteil, wann, netto, monate } für eine Nettosumme. monate: null = nach Ereignis (z. B. Abnahme). */
export function plan(kat, net, variante = 'standard', raten = 4) {
  if (variante !== 'raten') return kat.pay.map(p => ({ name: p.name, anteil: `${p.pct} %`, wann: p.wann, netto: r2(net * p.pct / 100), monate: p.wann === 'bei Auftragserteilung' ? 0 : null }))
  const k = RATEN.includes(raten) ? raten : 4
  const an = r2(net / 2), rest = r2(net - an), je = r2(rest / k)
  const zeilen = [{ name: 'Anzahlung', anteil: '50 %', wann: 'bei Auftragserteilung', netto: an, monate: 0 }]
  for (let i = 1; i <= k; i++) zeilen.push({ name: `Rate ${i} von ${k}`, anteil: '', wann: `${monateText(i)} nach Auftragserteilung`, netto: i < k ? je : r2(rest - je * (k - 1)), monate: i })
  return zeilen
}

/** Datum in Berlin plus n Monate; der Tag wird auf das Monatsende gekappt (31.01. + 1 Monat = 28./29.02.). */
export function plusMonate(d, n) {
  const [y, m, t] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number)
  const letzter = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + n, Math.min(t, letzter), 12))
}

/** Variante und Ratenzahl aus einer Anfrage, nur bekannte Werte. */
export function variante(roh, raten) {
  const v = roh === 'raten' ? 'raten' : 'standard'
  const k = Number(raten)
  return { variante: v, raten: v === 'raten' ? (RATEN.includes(k) ? k : null) : null }
}
