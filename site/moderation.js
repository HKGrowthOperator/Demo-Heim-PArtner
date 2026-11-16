(() => {
  'use strict';
  const url=new URL(location.href);
  const istProbe=url.searchParams.get('modus')==='probe';
  const istZuschauer=url.searchParams.get('mitsehen')==='1';
  const schluessel='hp-moderation-v1';
  let inhaber='';
  if(url.hash.startsWith('#moderation=')){
    const neu=new URLSearchParams(url.hash.slice(1)).get('moderation');
    if(!istZuschauer && !istProbe && /^[A-Za-z0-9._~-]{30,512}$/.test(neu||'')){
      inhaber=neu;
      try{sessionStorage.setItem(schluessel,neu);}catch{}
      url.searchParams.set('modus','termin');
    }
    url.hash='';
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  if(!istProbe&&!istZuschauer&&!inhaber){try{inhaber=sessionStorage.getItem(schluessel)||'';}catch{}}
  // Zugang nur im aktuellen Moderationsfenster verwenden.
  window.hpModerationsHeader=()=>inhaber&&!istProbe&&!istZuschauer?{Authorization:'Bearer '+inhaber}:{};
})();
