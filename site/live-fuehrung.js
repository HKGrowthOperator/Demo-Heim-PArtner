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
let zuletzt='',veroeffentlicht=null,zuletztAuswahl='',sendeauftrag=null,erneut=false;
let timer=null;
const modell=()=>window.HPLiveModell;
const mod=()=>probe||gast?null:hole('hp-moderation-v1');
const anzeige=text=>{if($('hp-live-status'))$('hp-live-status').textContent=text};
function button(t,fn){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=t;b.addEventListener('click',fn);return b}
function zuschauerLink(){return new URL('/?mitsehen=1#'+verbindung.lesen,location.origin).href}
function dialog(){
 if(!mod())return;
 const d=document.createElement('dialog');d.className='hp-live-dialog';const h=document.createElement('h2');h.textContent='Gemeinsam durch den Termin';d.append(h);
 const p=document.createElement('p');p.textContent='Mit dem Zuschauerlink folgen die Partner deiner Produktdemo und der Leistungsauswahl. Den Vertrag öffnen die Partner selbst.';d.append(p);
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
      verbindung=await api('start',{uebernehmen:offen,stand:moment()});merke('hp-live-leitung',JSON.stringify(verbindung));zuletzt='';await senden();await zeichne();knopf();
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
function aufhoeren(){verbindung=null;merke('hp-live-leitung',null);knopf()}
function moment(){
 const s=modell().lesen();
 const key=JSON.stringify([s.auswahl,s.raten,s.rollen,s.wirkung]);
 if(zuletztAuswahl!==key){zuletztAuswahl=key;veroeffentlicht=null}
 return {...s,angebot:veroeffentlicht};
}
async function senden(){
 if(!verbindung||!mod()||!modell())return;
 if(sendeauftrag){erneut=true;await sendeauftrag;if(erneut&&verbindung)return senden();return}
 const stand=moment(),wert=JSON.stringify(stand);if(zuletzt===wert)return;
 const umgebung=verbindung;
 sendeauftrag=(async()=>{try{await api('stand',{schreiben:umgebung.schreiben,stand});if(umgebung===verbindung){zuletzt=wert;knopf()}}catch(e){if(umgebung===verbindung){if(e.status===403||e.status===409){aufhoeren();anzeige('Die Live-Moderation ist beendet.')}else if($('hp-live-teilen'))$('hp-live-teilen').textContent='Live · Verbindung prüfen'}}})();
 await sendeauftrag;sendeauftrag=null;const nochmal=erneut;erneut=false;if(nochmal)await senden();
}
function warte(t){document.documentElement.classList.add('hp-wartet');anzeige(t);const a=$('hp-live-angebot');if(a)a.hidden=true}
async function gastLesen(){
 if(aktion||!lesen||!modell())return;
 aktion=true;try{
  const v=await api('zuschauen');const neu=JSON.stringify(v.stand);
  if(neu!==zuletzt){const lesestand=v.stand;modell().zeigen(lesestand);zuletzt=neu;
    const a=$('hp-live-angebot');a.hidden=!lesestand.angebot;if(lesestand.angebot)a.href='/angebot/?stand='+lesestand.angebot;else a.removeAttribute('href');
  }
  document.documentElement.classList.remove('hp-wartet');anzeige('Live · Du folgst der Moderation');
 }catch(e){if(e.status===410){warte('Diese Führung ist beendet.');clearInterval(timer)}else anzeige('Verbindung unterbrochen. Neuer Versuch läuft.')}finally{aktion=null}
}
function start(){
 knopf();$('hp-live-teilen')?.addEventListener('click',dialog);
 if(gast){warte(lesen?'Verbindung zur Führung wird hergestellt …':'Bitte öffne den vollständigen Zuschauerlink.');if(lesen){gastLesen();timer=setInterval(gastLesen,1100)}}
 else if(!probe){timer=setInterval(()=>{if(verbindung&&mod())senden()},1200)}
}
window.HPLive={gast,async angebot(url){if(!verbindung||!mod())return;moment();veroeffentlicht=new URL(url,location.origin).searchParams.get('stand');await senden()},geaendert(){if(!gast&&verbindung)queueMicrotask(senden)}};
window.addEventListener('DOMContentLoaded',start);
})();
