// Preise rechnet nur der Server, aus dem Katalog. Was der Browser schickt, ist nur die Auswahl.

export const r2 = n => Math.round(n * 100) / 100

/**
 * auswahl: { addonId: menge } — Menge zählt nur bei Add-ons mit Mengenangabe.
 * Add-ons mit art -1 (Schnittstellen) sind nur „Angebot anfordern“ und gehen nicht in die Summe.
 */
export function berechne(kat, auswahl = {}) {
  const posten = [], angefragt = []
  let einmal = 0, monat = 0, web = false
  for (const a of kat.add) {
    const roh = auswahl[a.id]
    if (!roh) continue
    if (a.art === -1) { angefragt.push({ id: a.id, name: a.name }); continue }
    const menge = a.menge ? Math.min(50, Math.max(1, Math.floor(Number(roh) || 1))) : 1
    einmal += a.preis * menge
    monat += a.monat * menge
    if (a.art === 1) web = true
    posten.push({ id: a.id, name: a.name, gruppe: a.gruppe, menge, preis: a.preis, monat: a.monat, summe: a.preis * menge, summeMonat: a.monat * menge })
  }
  const webMonat = web ? kat.websiteExtraMonat : 0
  const net = kat.net + einmal
  const ust = r2(net * 0.19)
  const raten = kat.pay.map(p => ({ ...p, netto: r2(net * p.pct / 100) }))
  return { posten, angefragt, einmal, monat, webMonat, net, ust, brutto: r2(net + ust), mon: kat.care + monat + webMonat, raten }
}

/** Nur bekannte Add-on-IDs mit positiver Menge übernehmen. */
export function bereinigeAuswahl(kat, roh) {
  const out = {}
  if (!roh || typeof roh !== 'object') return out
  for (const a of kat.add) {
    const v = roh[a.id]
    if (v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && Number(v) > 0)) out[a.id] = a.menge ? Math.min(50, Math.max(1, Math.floor(Number(v) || 1))) : 1
  }
  return out
}
