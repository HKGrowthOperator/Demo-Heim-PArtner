/* Gemeinsame Moderation. Leselink und persönlicher Zugang erfüllen getrennte Aufgaben. */
(function(){
'use strict';
const qs=new URLSearchParams(location.search),gast=qs.get('mitsehen')==='1',probe=qs.get('modus')==='probe';
const $=id=>document.getElementById(id);
const hole=k=>{try{return sessionStorage.getItem(k)}catch{return null}};
const merke=(k,v)=>{try{if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch{}};
let lesen=gast?(location.hash.slice(1)||hole('hp-live-gast')):null;
if(gast){document.documentElement.classList.add('hp-zuschauer','hp-wartet');if(/^[a-f0-9]{48}$/.test(lesen||'')){merke('hp-live-gast',lesen);history.replaceState(null,'',location.pathname+location.search)}else lesen=null}
let verbindung=null,aktion=null;
try{verbindung=JSON.parse(hole('hp-live-leitung'))}catch{}
if(gast||probe)verbindung=null;
let zuletzt='',veroeffentlicht=null,zuletztAuswahl='',sendeauftrag=null,erneut=false,letzterVersuch=0;
let position={step:1,sub:0,daten:{}},lesestand=null,timer=null;
const modell=()=>window.HPLiveModell;
const mod=()=>probe||gast?null:hole('hp-moderation-v1');
const anzeige=text=>{if($('hp-live-status'))$('hp-live-status').textContent=text};
function button(t,fn){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=t;b.addEventListener('click',fn);return b}
function zuschauerLink(){return new URL('/?mitsehen=1#'+verbindung.lesen,location.origin).href}
function dialog(){
 if(!mod())return;
 const d=document.createElement('dialog');d.className='hp-live-dialog';const h=document.createElement('h2');h.textContent='Gemeinsam durch den Termin';d.append(h);
 const p=document.createElement('p');p.textContent='Mit dem Zuschauerlink folgen die Partner deiner Demo, der aktuellen Folie und der Leistungsauswahl. Persönliche Gesprächsnotizen bleiben bei dir. Den Vertrag öffnen die Partner selbst.';d.append(p);
 const bereich=document.createElement('div');d.append(bereich);
 const melden=t=>{let s=d.querySelector('[role=status]');if(!s){s=document.createElement('p');s.setAttribute('role','status');d.append(s)}s.textContent=t};
 const zeichne=async()=>{
   bereich.replaceChildren();
   if(verbindung){
     const f=document.createElement('input');f.readOnly=true;f.value=zuschauerLink();f.setAttribute('aria-label','Zuschauerlink');bereich.append(f);
     bereich.append(button('Zuschauerlink kopieren',async()=>{try{await navigator.clipboard.writeText(f.value);melden('Zuschauerlink kopiert.')}catch{f.select();melden('Link markiert. Du kannst ihn jetzt kopieren.')}}));
     bereich.append(button('Übertragung beenden',async()=>{try{await api('ende',{schreiben:verbindung.schreiben});aufhoeren();d.close()}catch(e){melden(e.message)}}));return;
   }
   let offen;try{offen=(await api('status')).aktiv}catch(e){melden(e.message);return}
   if(offen)melden('In einem anderen Fenster läuft bereits die Führung. Bei Übernahme folgen die Partner diesem Fenster.');
   const b=button(offen?'Führung hier übernehmen':'Live-Link erstellen',async()=>{b.disabled=true;try{
      verbindung=await api('start',{uebernehmen:offen,stand:moment()});merke('hp-live-leitung',JSON.stringify(verbindung));zuletzt='';anDeck('live-on');await senden();await zeichne();knopf();
    }catch(e){b.disabled=false;melden(e.message)}});bereich.append(b);
 };
 const schliessen=button('Schließen',()=>d.close());d.append(schliessen);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();zeichne();
}
async function api(name,body){
 const headers=gast?{'X-HP-Zuschauer':lesen||''}:{'X-HK-Moderation':'Bearer '+(mod()||'')};if(body)headers['Content-Type']='application/json';
 const r=await fetch('/api/fuehrung/'+name,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const j=await r.json();if(!r.ok){const e=Error(j.fehler||'Verbindung unterbrochen.');e.status=r.status;throw e}return j
}
function knopf(){const b=$('hp-live-teilen');if(!b)return;b.hidden=!mod();b.textContent=verbindung?'Live · Zuschauerlink':'Live teilen'}
function aufhoeren(){verbindung=null;merke('hp-live-leitung',null);anDeck('live-off');knopf()}
function anDeck(type,payload={}){const f=$('hp-praesentation');if(f&&modell())f.contentWindow.postMessage({channel:'heim-partner-gespraech',version:1,type,...payload},modell().deckOrigin)}
function moment(){
 const s=modell().lesen();
 const key=JSON.stringify([s.auswahl,s.raten,s.rollen,s.wirkung]);
 if(zuletztAuswahl!==key){zuletztAuswahl=key;veroeffentlicht=null}
 return {...s,deck:s.seite==='praes'&&s.folie===position.step?position:{step:s.folie||1,sub:0},angebot:veroeffentlicht};
}
async function senden(){
 if(!verbindung||!mod()||!modell())return;
 if(sendeauftrag){erneut=true;await sendeauftrag;if(erneut&&verbindung)return senden();return}
 const stand=moment(),wert=JSON.stringify(stand);if(zuletzt===wert)return;
 const umgebung=verbindung;
 sendeauftrag=(async()=>{try{await api('stand',{schreiben:umgebung.schreiben,stand});if(umgebung===verbindung){zuletzt=wert;knopf()}}catch(e){if(umgebung===verbindung){if(e.status===403||e.status===409){aufhoeren();anzeige('Die Live-Moderation ist beendet.')}else if($('hp-live-teilen'))$('hp-live-teilen').textContent='Live · Verbindung prüfen'}}})();
 await sendeauftrag;sendeauftrag=null;const nochmal=erneut;erneut=false;if(nochmal)await senden();
}
function deckNachricht(ev){
 const f=$('hp-praesentation'), m=ev.data;
 if(!modell()||!f||ev.source!==f.contentWindow||ev.origin!==modell().deckOrigin||!m||m.channel!=='heim-partner-gespraech'||m.version!==1)return;
 if(m.type==='ready'){if(gast&&lesestand)anDeck('live-show',lesestand.deck);else if(verbindung)anDeck('live-on')}
 if(!gast&&verbindung&&m.type==='live-position'){position={step:m.step,sub:m.sub,daten:m.daten||{}};senden()}
}
function warte(t){document.documentElement.classList.add('hp-wartet');anzeige(t);const a=$('hp-live-angebot');if(a)a.hidden=true}
async function gastLesen(){
 if(aktion||!lesen||!modell())return;
 aktion=true;try{
  const v=await api('zuschauen');const neu=JSON.stringify(v.stand);
  if(neu!==zuletzt){lesestand=v.stand;modell().zeigen(lesestand);zuletzt=neu;
    const a=$('hp-live-angebot');a.hidden=!lesestand.angebot;if(lesestand.angebot)a.href='/angebot/?stand='+lesestand.angebot;else a.removeAttribute('href');
    anDeck('live-show',lesestand.deck);
  }
  document.documentElement.classList.remove('hp-wartet');anzeige('Live · Du folgst der Moderation');
 }catch(e){if(e.status===410){warte('Diese Führung ist beendet.');clearInterval(timer)}else anzeige('Verbindung unterbrochen. Neuer Versuch läuft.')}finally{aktion=null}
}
function start(){
 knopf();$('hp-live-teilen')?.addEventListener('click',dialog);
 if(gast){warte(lesen?'Verbindung zur Führung wird hergestellt …':'Bitte öffne den vollständigen Zuschauerlink.');if(lesen){gastLesen();timer=setInterval(gastLesen,1100)}}
 else if(!probe){timer=setInterval(()=>{if(verbindung&&mod()){senden();if(Date.now()-letzterVersuch>5000){letzterVersuch=Date.now();anDeck('live-on')}}},1200)}
}
window.HPLive={gast,async angebot(url){if(!verbindung||!mod())return;moment();veroeffentlicht=new URL(url,location.origin).searchParams.get('stand');await senden()},geaendert(){if(!gast&&verbindung)queueMicrotask(senden)}};
window.addEventListener('message',deckNachricht);
window.addEventListener('DOMContentLoaded',start);
})();
