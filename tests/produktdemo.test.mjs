import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sichtbarerStand} from '../server/fuehrung.mjs';

const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const geteilteAnsicht=html.slice(html.indexOf('window.HPLiveModell={'),html.indexOf('\ngespraechLaden();'));
const katalog={ADD:[],AREA:[]};

function bildschirm(gast){
  const s={cfg:{add:{},qty:{},raten:0},roi:{a:{},tf:100},route:'cockpit',tour:-1,user:'dennis',nu:{tab:'ranking'},wf:{tab:'agents'}};
  const vergleich={go(){s.route='vergabe';s.tid='t1';s.ttab='vergleich';s.ana='done';}};
  const umgebung=vm.createContext({
    S:s,OF:katalog,TEAM:[['dennis'],['schuster']],TOUR:[vergleich],GESPRAECHSTOUR:[],rundgang:[],
    window:{HPLive:{gast},scrollTo(){}},document:{getElementById(){return {}}},
    asUser(id){s.user=id;},render(){},fokusAufStation(){},
  });
  vm.runInContext('rundgang=TOUR;'+geteilteAnsicht,umgebung);
  return {s,modell:umgebung.window.HPLiveModell};
}

test('Zuschauer folgt auch mitten in der Produktführung dem manuell gewählten Reiter und der Rolle',()=>{
  const nick=bildschirm(false), kunde=bildschirm(true);
  Object.assign(nick.s,{route:'vergabe',tour:0,tid:'t1',ttab:'vergleich',ana:'done'});
  const uebertragen=()=>kunde.modell.zeigen(sichtbarerStand(nick.modell.lesen(),katalog));
  uebertragen();
  assert.equal(kunde.s.ttab,'vergleich');
  nick.s.ttab='bieter';
  uebertragen();
  assert.equal(kunde.s.tour,0);
  assert.equal(kunde.s.ttab,'bieter');
  const neuerGast=bildschirm(true);
  neuerGast.modell.zeigen(sichtbarerStand(nick.modell.lesen(),katalog));
  assert.equal(neuerGast.s.ttab,'bieter');
  Object.assign(nick.s,{route:'projekt',tour:-1,user:'schuster',ptab:'tagebuch'});
  uebertragen();
  assert.equal(kunde.s.user,'schuster');
  assert.equal(kunde.s.route,'projekt');
  assert.equal(kunde.s.ptab,'tagebuch');
});

test('Produkt und veröffentlichte Quelle enthalten keine eingebettete Folienansicht',()=>{
  const quelle=readFileSync(new URL('../source/app.src.html',import.meta.url),'utf8');
  const live=readFileSync(new URL('../site/live-fuehrung.js',import.meta.url),'utf8');
  for(const s of [html,quelle,live])assert.doesNotMatch(s,/gespraech-02aedca599|data-go="praes"|tour-praes|hp-praesentation|Annahmen im Präsentationsrechner|Präsentation öffnen/);
});
