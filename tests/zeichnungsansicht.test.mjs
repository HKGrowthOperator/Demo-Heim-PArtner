import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const script = name => fs.readFileSync(new URL('../site/'+name,import.meta.url),'utf8')
const unbenutzterSchluessel = 'a'.repeat(64)
function moderation(link, gespeichert) {
  const eintraege = new Map(gespeichert ? [['hp-moderation-v1',gespeichert]] : [])
  const umgebung = {
    URL, URLSearchParams, window:{}, location:new URL(link),
    history:{replaceState(_a,_b,pfad){umgebung.location=new URL(pfad,umgebung.location)}},
    sessionStorage:{getItem:k=>eintraege.get(k),setItem:(k,v)=>eintraege.set(k,v)}
  }
  vm.runInNewContext(script('moderation.js'),umgebung)
  return {url:umgebung.location,header:umgebung.window.hpModerationsHeader(),eintraege}
}

test('Nur der persönliche Moderationslink übergibt das Zugangsmerkmal. Sein Fragment wird sofort entfernt.',()=>{
  const auth=moderation('https://demo.invalid/?modus=termin#moderation='+unbenutzterSchluessel)
  assert.equal(auth.header.Authorization,'Bearer '+unbenutzterSchluessel)
  assert.equal(auth.url.hash,'#fuehrung')
  assert.equal(auth.url.href.includes(unbenutzterSchluessel),false)
  assert.equal(auth.eintraege.get('hp-moderation-v1'),unbenutzterSchluessel)
  const gast=moderation('https://demo.invalid/')
  assert.equal(gast.header.Authorization,undefined)
})

test('Eine Probe erhält auch mit aufgefrischtem oder vorherigem Moderationslink keine Moderationsrechte.',()=>{
  const probe=moderation('https://demo.invalid/?modus=probe#moderation='+unbenutzterSchluessel,unbenutzterSchluessel)
  assert.equal(probe.url.searchParams.get('modus'),'probe')
  assert.equal(probe.url.href.includes(unbenutzterSchluessel),false)
  assert.equal(probe.header.Authorization,undefined)
  assert.equal(moderation('https://demo.invalid/?mitsehen=1',unbenutzterSchluessel).header.Authorization,undefined)
})

test('Status und Download beziehen sich genau auf die ausgewählte Angebotsfassung.',async()=>{
  const id='c'.repeat(48), url='https://demo.invalid', entscheidungen=[], anfragen=[], elemente=[]
  let status, Anmeldung
  class Element {
    style={};getAttribute(name){return name==='stand'?id:null}
    append(el){elemente.push(el)}
    replaceChildren(...els){elemente.splice(0,elemente.length,...els)}
    dispatchEvent(e){entscheidungen.push(e.detail)}
  }
  const umgebung={HTMLElement:Element,URL,AbortController,CustomEvent:class{constructor(_t,{detail}){this.detail=detail}},
    customElements:{define(n,k){if(n==='hp-zeichnungsstand')Anmeldung=k}},location:{origin:url},
    document:{hidden:false,createElement:()=>({})},fetch:async u=>{anfragen.push(u);return {ok:true,json:async()=>status}},
    setTimeout:()=>{},clearTimeout:()=>{}}
  vm.runInNewContext(script('angebot/zeichnungsstand.js'),umgebung)
  const anzeige=new Anmeldung();anzeige.aktiv=true;
  status={status:'wartet',hinweis:'HK-Freigabe ausstehend'};await anzeige.aktualisieren()
  assert.equal(entscheidungen.at(-1).status,'wartet')
  status={status:'bereit',hinweis:'HK hat persönlich vorgezeichnet.'};await anzeige.aktualisieren()
  assert.equal(entscheidungen.at(-1).status,'bereit')
  const pdf='/api/vertrag/datei/vertrag.pdf?zugang=beispiel'
  status={status:'abgeschlossen',pdf};await anzeige.aktualisieren()
  assert.equal(anzeige.fertig,true)
  assert.equal(elemente.at(-1).href,url+pdf)
  assert.equal(anfragen.every(x=>x==='/api/zeichnung/status?stand='+id),true)
})

test('Ein historischer Abschluss wird ohne beidseitigen Nachweis neutral angezeigt.',async()=>{
 const js=script('angebot/zeichnungsstand.js')
 assert.match(js,/antwort\.status==='abgeschlossen'&&!antwort\.pdf\?'Früherer Vertragsabschluss'/)
 for(const seite of ['angebot/vertrag/index.html','angebot/vertrag-raten/index.html']){
   assert.match(script(seite),/type="submit" id="go" disabled/)
   assert.match(script(seite),/if\(!bereitZurZeichnung\|\|abgelaufen\|\|abgeschlossen\|\|wirdGesendet\)return;/)
 }
})

test('Die Moderation sieht zulässige Mengen und Zahlungspläne und jeden Unterschied zur geplanten Auswahl.',async()=>{
  class Element{
    constructor(){this.kinder=[];this.attrs={}}
    getAttribute(n){return this.attrs[n]}
    append(...els){this.kinder.push(...els)}
    replaceChildren(...els){this.kinder=els}
    inhalt(){return [this.textContent,...this.kinder.map(e=>e.inhalt())].filter(Boolean).join(' ')}
  }
  let Typ,url,header,freigabe;const key='Bearer '+unbenutzterSchluessel
  const context={HTMLElement:Element,customElements:{define(n,k){if(n==='hp-zeichnungsrahmen')Typ=k}},
    window:{hpModerationsHeader:()=>({Authorization:key})},document:{hidden:false,createElement:()=>new Element},
    fetch:async(u,o)=>{url=u;header=o.headers;return{ok:true,json:async()=>freigabe}},setTimeout:()=>{},clearTimeout:()=>{}}
  vm.runInNewContext(script('angebot/zeichnungsstand.js'),context)
  freigabe={unterzeichnet:true,abgeschlossen:false,modus:'wahlrahmen',optionen:{zu:2},zahlungsplaene:[0,3]}
  const komponent=new Typ();komponent.aktiv=true;komponent.attrs={auswahl:'{"zu":3,"ib":1}',raten:'4',namen:'{"zu":"Weitere Zugänge","ib":"Interessentenbereich"}'}
  await komponent.aktualisieren()
  assert.equal(url,'/api/zeichnung/rahmen');assert.equal(header['X-HK-Moderation'],key)
  assert.match(komponent.inhalt(),/gewählt 3, freigegeben 2/);assert.match(komponent.inhalt(),/Interessentenbereich ist für diesen Termin nicht freigegeben/)
  assert.match(komponent.inhalt(),/gewählte Zahlungsweise ist nicht freigegeben/);assert.match(komponent.inhalt(),/Weitere Zugänge \(bis zu 2\)/)
  komponent.attrs.auswahl='{"zu":1}';komponent.attrs.raten='3';await komponent.aktualisieren();assert.match(komponent.inhalt(),/liegt innerhalb der Freigabe/)
  context.window.hpModerationsHeader=()=>({});url=null;await komponent.aktualisieren();assert.equal(url,null)
})

test('Kundenlink, Vorschau in eigenem Tab und Unterschriftsstatus gehören zur selben Auswahl',()=>{
  const id='c'.repeat(48), origin='https://demo.invalid', html=script('index.html')
  const begin=html.indexOf('function freigegebenerStand('), end=html.indexOf('async function angebotsFassungOeffnen',begin)
  const context={URL,location:{origin},esc:s=>s.replaceAll('&','&amp;')}
  vm.runInNewContext(html.slice(begin,end),context)
  const fassung={inhalt:'drei Zugänge',angebot:'/angebot/?stand='+id,vertrag:'/angebot/vertrag-raten/?stand='+id+'&raten=3&add=zu%3A3'}
  const ansicht=context.freigegebenerStand(fassung,fassung.inhalt)
  assert.ok(ansicht.includes('value="'+origin+fassung.angebot+'"'))
  assert.ok(ansicht.includes('href="'+context.esc(fassung.vertrag)+'" target="_blank" rel="noopener noreferrer"'))
  assert.ok(ansicht.includes('<hp-zeichnungsstand stand="'+id+'"'))
  const vorher=context.freigegebenerStand(fassung,'zwei Zugänge')
  assert.match(vorher,/Vorherige Kundenfassung/)
  assert.ok(!vorher.includes('data-kopiere-angebot'))
  assert.ok(vorher.includes('<hp-zeichnungsstand stand="'+id+'"'))
  assert.equal(context.freigegebenerStand({...fassung,vertrag:'/angebot/vertrag/?stand='+'f'.repeat(48)},fassung.inhalt),'')
  const ende=html.indexOf("document.addEventListener('click'",end)
  assert.doesNotMatch(html.slice(end,ende),/location\.assign|location\.href\s*=/)
})
