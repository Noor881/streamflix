// Minimal IndexedDB helper (promise-based)
(function(global){
  const DB_NAME = 'streamflix-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e)=>{
        const db = e.target.result;
        if (!db.objectStoreNames.contains('watchlist')) db.createObjectStore('watchlist', {keyPath:'id'});
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', {autoIncrement:true});
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
    return dbPromise;
  }

  async function put(storeName, value){
    const db = await openDB();
    return new Promise((res,rej)=>{
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = ()=> res(true);
      tx.onerror = ()=> rej(tx.error);
    });
  }

  async function del(storeName, key){
    const db = await openDB();
    return new Promise((res,rej)=>{
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = ()=> res(true);
      tx.onerror = ()=> rej(tx.error);
    });
  }

  async function getAll(storeName){
    const db = await openDB();
    return new Promise((res,rej)=>{
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = ()=> res(req.result);
      req.onerror = ()=> rej(req.error);
    });
  }

  async function get(storeName, key){
    const db = await openDB();
    return new Promise((res,rej)=>{
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = ()=> res(req.result);
      req.onerror = ()=> rej(req.error);
    });
  }

  global.IDB = { openDB, put, del, getAll, get };
})(self);
