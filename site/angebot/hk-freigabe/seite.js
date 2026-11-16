(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const form = el('freigabe');
  const euro = n => new Intl.NumberFormat('de-DE', {style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n);
  const radio = () => form.elements.modus.value;
  const sitzungsFeld='hp-hk-einladung-v1';
  let schluessel = location.hash.slice(1);
  try{
    if(schluessel)sessionStorage.setItem(sitzungsFeld,schluessel);
    else schluessel=sessionStorage.getItem(sitzungsFeld)||'';
  }catch{}
  const vergessen=()=>{try{sessionStorage.removeItem(sitzungsFeld);}catch{}schluessel='';};
  history.replaceState(null, '', location.pathname + location.search);
  let daten, arbeitet = false;
  const datum = iso => new Date(iso).toLocaleString('de-DE', {timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'});
  const beschreibung = {0:'50 % bei Auftrag, 50 % nach Gesamtabnahme',3:'50 % bei Auftrag, die zweite Hälfte in drei Monatsraten ab Auftrag',4:'50 % bei Auftrag, die zweite Hälfte in vier Monatsraten ab Auftrag'};
  const mk = (tag, text) => { const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element; };
  function lokalLink(titel, ziel) {
    const url = new URL(ziel, location.origin);
    if(url.origin!==location.origin || !url.pathname.startsWith('/angebot/')) throw Error('Die Unterlagen konnten nicht zugeordnet werden.');
    const a=mk('a',titel);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';el('unterlagen').append(a);
  }
  async function api(pfad, eingabe) {
    const options={headers:{Authorization:'Bearer '+schluessel},cache:'no-store',referrerPolicy:'no-referrer'};
    if(eingabe){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(eingabe);}
    const r=await fetch('/api/zeichnung/'+pfad,options);
    const d=await r.json().catch(()=>({}));
    if(r.status===403||r.status===410)vergessen();
    if(!r.ok)throw Error(d.fehler||'Die Freigabe konnte nicht geprüft werden. Öffne deinen persönlichen Link erneut.');
    return d;
  }
  function optionenAnzeigen() {
    for(const o of daten.optionen){
      const zeile=mk('div');zeile.className='option';
      const label=mk('label'), box=mk('input'), inhalt=mk('span');
      box.type='checkbox';box.dataset.option=o.id;inhalt.append(mk('b',o.name));
      const preis=o.anfrage?'Nur als separate Anfrage':(o.preis?euro(o.preis)+' einmalig':'')+(o.preis&&o.monat?' und ':'')+(o.monat?euro(o.monat)+' monatlich':'')+(!o.preis&&!o.monat?'Im Preis enthalten':'');
      inhalt.append(mk('small',preis+(o.max>1?' je Einheit':'')+(o.website?' · mit gemeinsamer Website-Betreuung':'')));
      if(o.text)inhalt.append(mk('small',o.text));label.append(box,inhalt);zeile.append(label);
      if(o.max>1){
        const menge=mk('label','Bis zu '),zahl=mk('input');menge.className='menge';zahl.type='number';zahl.min='1';zahl.max=String(o.max);zahl.step='1';zahl.value='1';zahl.disabled=true;zahl.dataset.menge=o.id;
        zahl.setAttribute('aria-label','Freigegebene Höchstmenge für '+o.name);menge.append(zahl);zeile.append(menge);
      }
      el('optionen').append(zeile);
    }
    el('websitegebuehr').textContent='Bei Auswahl mindestens einer entsprechenden Website-Erweiterung fallen für alle gewählten Website-Erweiterungen zusammen '+euro(daten.websitePauschale)+' monatlich an.';
    for(const n of daten.zahlungsplaene){
      const label=mk('label'),box=mk('input');label.className='wahl';box.type='checkbox';box.dataset.plan=String(n);label.append(box,mk('span',beschreibung[n]));el('plaene').append(label);
    }
  }
  const kostenwahl=()=>[...el('optionen').querySelectorAll('[data-option]:checked')].map(input=>{
    const opt=daten.optionen.find(o=>o.id===input.dataset.option);
    const f=el('optionen').querySelector('[data-menge="'+CSS.escape(opt.id)+'"]');
    return {opt,zahl:f?Number(f.value):1};
  });
  function aktualisieren() {
    const rahmen=radio()==='wahlrahmen';
    el('rahmen').hidden=!rahmen;el('zeichnen').disabled=!radio();el('erklaerung').textContent=daten.erklaerung[radio()]||'';
    if(!rahmen)return;
    for(const feld of el('optionen').querySelectorAll('[data-menge]')){
      feld.disabled=!el('optionen').querySelector('[data-option="'+CSS.escape(feld.dataset.menge)+'"]').checked;
    }
    const wahl=kostenwahl();
    if(wahl.some(({opt,zahl})=>!Number.isInteger(zahl)||zahl<1||zahl>opt.max)){el('hoechstpreis').textContent='Bitte prüfe die Höchstmengen.';return;}
    const einmal=wahl.reduce((sum,{opt,zahl})=>sum+(opt.anfrage?0:opt.preis*zahl),daten.basis);
    const monat=wahl.reduce((sum,{opt,zahl})=>sum+(opt.anfrage?0:opt.monat*zahl),daten.betreuung)+(wahl.some(({opt})=>opt.website&&!opt.anfrage)?daten.websitePauschale:0);
    el('hoechstpreis').textContent=euro(einmal)+' netto einmalig und '+euro(monat)+' netto monatlich ab Livegang. KI und Drittdienste nach Vertrag.';
  }

  const cv=el('signatur'), cx=cv.getContext('2d');let linien=[],aktiv=null;
  function zeichnen() {
    cx.clearRect(0,0,cv.width,cv.height);cx.strokeStyle='#203137';cx.lineWidth=3;cx.lineCap='round';cx.lineJoin='round';
    for(const linie of linien){cx.beginPath();linie.forEach(([x,y],i)=>{if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();}
  }
  function zuruecksetzen() {linien=[];aktiv=null;zeichnen();}
  const punkt=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
  cv.addEventListener('pointerdown',e=>{if(arbeitet||el('zeichnen').disabled||aktiv!==null)return;e.preventDefault();cv.setPointerCapture(e.pointerId);aktiv=e.pointerId;linien.push([punkt(e)]);});
  cv.addEventListener('pointermove',e=>{if(e.pointerId!==aktiv)return;e.preventDefault();linien.at(-1).push(punkt(e));zeichnen();});
  const ende=e=>{if(e.pointerId===aktiv){aktiv=null;zeichnen();}};
  cv.addEventListener('pointerup',ende);cv.addEventListener('pointercancel',ende);
  el('loeschen').addEventListener('click',zuruecksetzen);
  function freigabeZuruecknehmen(){form.elements.zustimmung.checked=false;zuruecksetzen();aktualisieren();}
  form.addEventListener('input',e=>{if(arbeitet)return;const t=e.target;if(t.name==='modus'||t.dataset.option||t.dataset.plan!==undefined||t.dataset.menge||t.name==='ort'||t.name==='funktion')freigabeZuruecknehmen();});
  el('alle').addEventListener('click',()=>{el('optionen').querySelectorAll('[data-option]').forEach(x=>x.checked=true);freigabeZuruecknehmen();});
  function fertig(d) {
    const zeit=d.zeitpunkt?(' am '+datum(d.zeitpunkt)+' Uhr'):'';
    el('quittung').textContent=(d.modus==='wahlrahmen'?'Der von dir gewählte Leistungs- und Zahlungsrahmen':'Die konkrete Angebotsfassung')+' wurde'+zeit+' für HK unterschrieben. Im Kundentermin erscheint die Freigabe bei der passenden Auswahl automatisch.';
    el('meldung').textContent='';el('inhalt').hidden=true;el('fertig').hidden=false;zuruecksetzen();vergessen();
  }
  function fehlermeldung(msg){el('fehler').textContent=msg;el('fehler').hidden=false;}
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(arbeitet||!form.reportValidity())return;
    const modus=radio(),optionen={},zahlungsplaene=[];
    if(modus==='wahlrahmen'){
      for(const {opt,zahl} of kostenwahl())optionen[opt.id]=zahl;
      for(const box of el('plaene').querySelectorAll('[data-plan]:checked'))zahlungsplaene.push(Number(box.dataset.plan));
      if(!zahlungsplaene.length){fehlermeldung('Bitte gib mindestens eine Zahlungsweise für den Termin frei.');return;}
    }
    const weglänge=linien.reduce((l,linie)=>l+linie.reduce((s,p,i)=>i?s+Math.hypot(p[0]-linie[i-1][0],p[1]-linie[i-1][1]):s,0),0);
    if(weglänge<30){fehlermeldung('Bitte zeichne deine Unterschrift in das Feld.');return;}
    const body={bindung:daten.bindung,modus,optionen,zahlungsplaene,name:form.elements.name.value,funktion:form.elements.funktion.value.trim(),ort:form.elements.ort.value.trim(),zustimmung:form.elements.zustimmung.checked,vertretungsberechtigt:form.elements.vertretungsberechtigt.checked,signatur:cv.toDataURL('image/png')};
    arbeitet=true;form.querySelectorAll('fieldset').forEach(f=>f.disabled=true);el('fehler').hidden=true;
    try{const antwort=await api('freigeben',body);fertig({...antwort,modus});}
    catch(err){fehlermeldung(err.message);}
    finally{arbeitet=false;form.querySelectorAll('fieldset').forEach(f=>f.disabled=false);}
  });
  async function start(){
    if(!schluessel){el('meldung').textContent='Bitte öffne deinen vollständigen persönlichen Freigabelink von Nick.';return;}
    try{
      daten=await api('einladung');if(daten.unterzeichnet){fertig(daten);return;}
      form.elements.name.value=daten.vorgesehenerName;
      el('bezug').textContent=daten.nr+' · '+(daten.kunde?.name||daten.kunde)+' · Fassung '+daten.stand.slice(0,12);
      el('preise').textContent=euro(daten.basis)+' netto einmalig und '+euro(daten.betreuung)+' netto monatlich ab Livegang.';
      lokalLink('Angebot ansehen',daten.angebot);lokalLink('Vertrag und Anlagen lesen',daten.vertrag);
      optionenAnzeigen();el('meldung').textContent='';el('inhalt').hidden=false;
    }catch(err){el('meldung').textContent=err.message;}
  }
  start();
})();
