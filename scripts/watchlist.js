// Watchlist helper (localStorage fallback)
(function(){
  // prefer IDB store; fallback to localStorage for older browsers
  async function addToIDB(movie){
    try{ await IDB.put('watchlist', movie); return true;}catch(e){return false}
  }
  async function removeFromIDB(id){
    try{ await IDB.del('watchlist', id); return true;}catch(e){return false}
  }
  async function getAllFromIDB(){
    try{ return await IDB.getAll('watchlist'); }catch(e){return []}
  }

  async function enqueueSync(payload){
    try{ await IDB.put('outbox', payload); }catch(e){/* ignore */}
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype){
      try{ const reg = await navigator.serviceWorker.ready; await reg.sync.register('sync-watchlist'); }catch(e){}
    }
  }

  window.Watchlist = {
    async add(movie){
      await addToIDB(movie);
      document.dispatchEvent(new CustomEvent('watchlist:change',{detail: await getAllFromIDB()}));
      // enqueue sync to server
      enqueueSync({action:'add', item: movie});
    },
    async remove(id){
      await removeFromIDB(id);
      document.dispatchEvent(new CustomEvent('watchlist:change',{detail: await getAllFromIDB()}));
      enqueueSync({action:'remove', id});
    },
    async get(){ return await getAllFromIDB(); },
    async has(id){ const all = await getAllFromIDB(); return !!all.find(x=>x.id===id); },
    async clear(){
      const list = await getAllFromIDB();
      for(const it of list) await removeFromIDB(it.id);
      document.dispatchEvent(new CustomEvent('watchlist:change',{detail:[]}));
      enqueueSync({action:'clear'});
    },
    // attempts immediate sync; will enqueue if fails
    async syncToServer(url){
      try{
        const list = await getAllFromIDB();
        const res = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({watchlist:list})});
        return res.ok;
      }catch(e){ await enqueueSync({action:'sync'}); return false }
    }
  };

  // UI hooks
  function handleClick(e){
    const b = e.target.closest('[data-watch-id]');
    if (!b) return;
    const id = b.getAttribute('data-watch-id');
    const title = b.getAttribute('data-watch-title') || '';
    (async ()=>{
      if (await Watchlist.has(id)){
        await Watchlist.remove(id);
        b.textContent = 'Add to My List';
        b.classList.remove('in-list');
      } else {
        await Watchlist.add({id,title});
        b.textContent = 'Remove from My List';
        b.classList.add('in-list');
      }
    })();
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('DOMContentLoaded', async ()=>{
    const buttons = document.querySelectorAll('[data-watch-id]');
    for(const b of buttons){
      const id = b.getAttribute('data-watch-id');
      if (await Watchlist.has(id)){ b.textContent = 'Remove from My List'; b.classList.add('in-list'); }
    }
  });

})();
