import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { einlassAb, ende, terminZiel, warteAnsicht } from '../server/termin.mjs'

test('Öffentliche Einstiege landen im Warteraum, die bisherigen Arbeitslinks öffnen die Demo', () => {
  const wartet = adresse => warteAnsicht(new URL(adresse, 'https://example.test'))
  for (const url of ['/', '/index.html', '/?utm_source=email', '/?modus=fremd', '/#praes-2']) assert.ok(wartet(url), url)
  for (const url of ['/?modus=termin', '/?modus=probe', '/?probe=1', '/?mitsehen=1', '/angebot/', '/vertrag', '/website/', '/healthz']) assert.equal(wartet(url), false, url)
})

test('Der öffentliche Beitritt führt nur im Terminfenster zum richtigen Zoom-Raum und enthält keinen Kenncode', () => {
  const oeffentlich = terminZiel(null, einlassAb)
  const ziel = new URL(oeffentlich)
  assert.equal(ziel.protocol, 'https:')
  assert.match(ziel.hostname, /(^|\.)zoom\.us$/)
  assert.match(ziel.pathname, /^\/j\/\d+$/)
  assert.equal(ziel.search, '')
  assert.equal(terminZiel('x'.repeat(43), ende - 1), oeffentlich)
  for (const t of [einlassAb - 1, ende, ende + 86400000]) {
    assert.equal(terminZiel(null, t), '/')
    assert.equal(terminZiel('x'.repeat(43), t), '/')
  }
})

test('Uhr und Einlass beziehen sich auf denselben Termin, vertrauliche Zoom-Parameter fehlen in der Seite', () => {
  const seite = readFileSync(new URL('../site/warteraum.html', import.meta.url), 'utf8')
  const zeit = id => Date.parse(seite.match(new RegExp('<time datetime="([^"]+)" id="' + id + '"'))[1])
  assert.equal(zeit('start') - einlassAb, 10 * 60_000)
  assert.equal(zeit('end'), ende)
  assert.doesNotMatch(seite, /zoom\.us\/j\/|[?&]pwd=/)
})
