(() => {
  'use strict';
  const daten = {wartet:'HK-Freigabe ausstehend',bereit:'HK hat unterschrieben',abgeschlossen:'Beide Seiten haben unterschrieben',andere_fassung:'Neue Freigabe erforderlich'};
  class Zeichnungsstand extends HTMLElement {
    connectedCallback() {
      if(this.aktiv)return;
      this.aktiv=true;
      this.style.cssText='display:block;margin:12px 0;padding:14px 16px;border:1px solid #c8d9d3;border-radius:8px;background:#f1f6f3;color:#203733';
      this.setAttribute('role','status');this.setAttribute('aria-live','polite');
      this.fokus=()=>this.aktualisieren();document.addEventListener('visibilitychange',this.fokus);window.addEventListener('focus',this.fokus);this.aktualisieren();
    }
    disconnectedCallback() {
      this.aktiv=false;this.anfrage?.abort();clearTimeout(this.timer);document.removeEventListener('visibilitychange',this.fokus);window.removeEventListener('focus',this.fokus);
    }
    async aktualisieren() {
      const stand=this.getAttribute('stand');
      if(!this.aktiv||document.hidden||this.anfrage||this.fertig||!/^[0-9a-f]{48}$/.test(stand||''))return;
      clearTimeout(this.timer);
      const anfrage=new AbortController();this.anfrage=anfrage;
      let antwort;
      try{
        const res=await fetch('/api/zeichnung/status?stand='+encodeURIComponent(stand),{cache:'no-store',referrerPolicy:'no-referrer',signal:anfrage.signal});
        if(!res.ok)throw Error();
        antwort=await res.json();if(!Object.hasOwn(daten,antwort.status))throw Error();
      }catch{antwort={status:'unbekannt',hinweis:'Wir versuchen es in wenigen Sekunden erneut.'};}
      finally{this.anfrage=null;}
      if(!this.aktiv||anfrage.signal.aborted)return;
      const vergleich=JSON.stringify(antwort);
      if(this.stand!==vergleich){
        this.stand=vergleich;const kopf=document.createElement('strong');kopf.textContent=antwort.status==='abgeschlossen'&&!antwort.pdf?'Früherer Vertragsabschluss':daten[antwort.status]||'Verbindungsstatus wird geprüft';const absatz=document.createElement('div');absatz.textContent=antwort.hinweis||'';
        this.replaceChildren(kopf,absatz);
        if(antwort.status==='abgeschlossen'&&typeof antwort.pdf==='string'){
          const url=new URL(antwort.pdf,location.origin);
          if(url.origin===location.origin){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Beidseitig unterschriebenen Vertrag öffnen';this.append(link);}
        }
        this.dispatchEvent(new CustomEvent('zeichnungaktuell',{detail:antwort,bubbles:true}));
      }
      this.fertig=antwort.status==='abgeschlossen';if(!this.fertig)this.timer=setTimeout(()=>this.aktualisieren(),5000);
    }
  }
  customElements.define('hp-zeichnungsstand',Zeichnungsstand);
  const zahlungsname=n=>n ? n+' Monatsraten für die zweite Hälfte' : '50 % bei Auftrag, 50 % nach Gesamtabnahme';
  // Der authentifizierte Rahmen bleibt nur kurz im Speicher dieses Moderationsfensters.
  let letzterAbruf=0, rahmenDaten=null, abruf=null;
  function rahmenLesen(){
    if(Date.now()-letzterAbruf<4500&&rahmenDaten)return Promise.resolve(rahmenDaten);
    if(abruf)return abruf;
    const header=window.hpModerationsHeader?.();
    if(!header?.Authorization)return Promise.reject(Error('Moderationszugang erforderlich.'));
    abruf=fetch('/api/zeichnung/rahmen',{headers:{'X-HK-Moderation':header.Authorization},cache:'no-store',referrerPolicy:'no-referrer'})
      .then(async r=>{
        if(!r.ok){rahmenDaten=null;throw Error(r.status===403||r.status===410?'Der persönliche Moderationszugang ist ungültig oder abgelaufen.':'Die HK-Freigabe kann gerade nicht geladen werden.');}
        const daten=await r.json();rahmenDaten=daten;letzterAbruf=Date.now();return daten;
      }).finally(()=>{abruf=null;});
    return abruf;
  }
  function rahmenVergleichen(rahmen,auswahl,raten,namen){
    const erlaubt=rahmen.optionen||{}, abweichungen=[];
    for(const [id,menge] of Object.entries(auswahl)){
      const name=namen[id]||id;
      if(!Object.hasOwn(erlaubt,id))abweichungen.push(name+' ist für diesen Termin nicht freigegeben.');
      else if(menge>erlaubt[id]||(rahmen.modus==='genau'&&menge!==erlaubt[id]))abweichungen.push(name+': gewählt '+menge+', freigegeben '+erlaubt[id]+'.');
    }
    if(rahmen.modus==='genau')for(const id of Object.keys(erlaubt))if(!Object.hasOwn(auswahl,id))abweichungen.push((namen[id]||id)+' fehlt gegenüber der vorgezeichneten Fassung.');
    if(!rahmen.zahlungsplaene.includes(raten))abweichungen.push('Die gewählte Zahlungsweise ist nicht freigegeben.');
    return abweichungen;
  }
  class Zeichnungsrahmen extends HTMLElement{
    connectedCallback(){
      this.aktiv=true;this.style.cssText='display:block;margin:12px 0;padding:14px 16px;border:1px solid #c8d9d3;border-radius:8px;background:#f1f6f3;color:#203733';
      this.setAttribute('role','status');this.setAttribute('aria-live','polite');
      this.sichtbar=()=>this.aktualisieren();document.addEventListener('visibilitychange',this.sichtbar);this.aktualisieren();
    }
    disconnectedCallback(){this.aktiv=false;clearTimeout(this.timer);document.removeEventListener('visibilitychange',this.sichtbar);}
    async aktualisieren(){
      clearTimeout(this.timer);
      if(!this.aktiv||document.hidden||!window.hpModerationsHeader?.().Authorization)return;
      try{
        const d=await rahmenLesen();if(!this.aktiv)return;
        const wert=this.getAttribute('auswahl'), raten=Number(this.getAttribute('raten'));
        const merk=JSON.stringify([d,wert,raten]);
        if(merk!==this.angezeigt){
          const namen=JSON.parse(this.getAttribute('namen')),auswahl=JSON.parse(wert);
          const titel=document.createElement('strong');titel.textContent=d.abgeschlossen?'Diese Angebotsrunde ist abgeschlossen.':!d.unterzeichnet?'Luis’ Unterschrift steht aus.':d.modus==='genau'?'Luis hat diese feste Fassung unterschrieben.':'Luis hat einen Wahlrahmen freigegeben.';
          this.replaceChildren(titel);
          if(d.unterzeichnet&&!d.abgeschlossen){
            const diffs=rahmenVergleichen(d,auswahl,raten,namen);
            const fazit=document.createElement('p');fazit.textContent=diffs.length?'Für diese Auswahl ist eine neue HK-Freigabe erforderlich.':'Die aktuelle Auswahl liegt innerhalb der Freigabe.';this.append(fazit);
            if(diffs.length){const ul=document.createElement('ul');for(const text of diffs){const li=document.createElement('li');li.textContent=text;ul.append(li);}this.append(ul);}
            const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Freigegebene Leistungen und Zahlungsweisen';details.append(summary);
            const items=Object.entries(d.optionen).map(([id,m])=>(namen[id]||id)+' ('+(d.modus==='genau'?'genau ':'bis zu ')+m+')');
            const optionen=document.createElement('p');optionen.textContent=items.length?'Zusätzlich zum Gesamtpaket: '+items.join(', ')+'.':'Freigegeben ist das Gesamtpaket ohne zusätzliche Leistungen.';
            const zahlung=document.createElement('p');zahlung.textContent='Zahlung: '+d.zahlungsplaene.map(zahlungsname).join(' oder ')+'.';
            details.append(optionen,zahlung);this.append(details);
          }
          this.angezeigt=merk;
        }
      }catch(e){if(this.aktiv){this.textContent=e.message;this.angezeigt=null;}}
      if(this.aktiv)this.timer=setTimeout(()=>this.aktualisieren(),5000);
    }
  }
  customElements.define('hp-zeichnungsrahmen',Zeichnungsrahmen);

})();
