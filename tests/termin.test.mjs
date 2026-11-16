import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { einlassAb, einlassBis, speichereTermin, terminZiel, warteAnsicht } from '../server/termin.mjs'

test('Öffentliche Einstiege landen im Warteraum, die bisherigen Arbeitslinks öffnen die Demo', () => {
  const wartet = adresse => warteAnsicht(new URL(adresse, 'https://example.test'))
  for (const url of ['/', '/index.html', '/?utm_source=email', '/?modus=fremd', '/#praes-2']) assert.ok(wartet(url), url)
  for (const url of ['/?modus=termin', '/?modus=probe', '/?probe=1', '/?mitsehen=1', '/angebot/', '/vertrag', '/website/', '/healthz']) assert.equal(wartet(url), false, url)
})

test('Der Zugang gilt nur für die Veranstaltung und fängt fehlende oder falsche Links ab', () => {
  const dir = mkdtempSync(join(tmpdir(), 'terminprobe-'))
  try {
    for (const zeit of [einlassAb - 1, einlassBis, einlassBis + 1]) assert.equal(terminZiel(dir, zeit), '/')
    for (const zeit of [einlassAb, einlassAb + 3600000, einlassBis - 1]) assert.throws(() => terminZiel(dir, zeit), {status: 503})
    assert.throws(() => speichereTermin(dir, 'https://example.test/'), {status: 422})
    assert.throws(() => speichereTermin(dir, null), {status: 422})
  } finally { rmSync(dir, {recursive: true}) }
})

test('Uhr und Einlass beziehen sich auf denselben Termin, vertrauliche Zoom-Parameter fehlen in der Seite', () => {
  const seite = readFileSync(new URL('../site/warteraum.html', import.meta.url), 'utf8')
  const zeit = id => Date.parse(seite.match(new RegExp('<time datetime="([^"]+)" id="' + id + '"'))[1])
  assert.equal(zeit('start') - einlassAb, 10 * 60_000)
  assert.ok(zeit('end') < einlassBis)
  assert.equal(Date.parse(seite.match(/const closes = Date.parse\('([^']+)'\)/)[1]), einlassBis)
  assert.doesNotMatch(seite, /zoom\.us\/j\/|[?&]pwd=/)
})
