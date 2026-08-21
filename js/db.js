"use strict";

const DB_NAME = "pfrp";
const DB_VERSION = 3;

const DB_STORES = {
  characters: "++id, name, folderPath, createdAt, updatedAt",
  threads: "++id, name, characterId, folderPath, createdAt, updatedAt, lastMessageTime",
  messages: "++id, &[threadId+order], threadId, characterId, order, creationTime",
  memories: "++id, threadId, type, index",
  lore: "++id, bookId, threadId, characterId, enabled",
  images: "++id, characterId, threadId, type, createdAt",
};

let _dbPromise = null;

function createStoreIndexes(store, schema) {
  const parts = schema.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part === "++id") continue;
    let spec = part;
    let unique = false;
    if (spec.startsWith("&")) {
      unique = true;
      spec = spec.slice(1);
    }
    const isCompound = spec.startsWith("[") && spec.endsWith("]");
    const fields = isCompound ? spec.slice(1, -1).split("+").map((s) => s.trim()) : [spec];
    const keyPath = isCompound ? fields : fields[0];
    const indexName = isCompound ? fields.join("+") : fields[0];
    if (store.indexNames.contains(indexName)) {
      const existing = store.index(indexName);
      if (existing.unique !== unique) {
        store.deleteIndex(indexName);
        store.createIndex(indexName, keyPath, { unique });
      }
    } else {
      store.createIndex(indexName, keyPath, { unique });
    }
  }
}

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOpen = () => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        for (const [name, schema] of Object.entries(DB_STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
            createStoreIndexes(store, schema);
          } else {
            const txn = e.target.transaction;
            const store = txn.objectStore(name);
            createStoreIndexes(store, schema);
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        if (attempt === 0) {
          attempt++;
          const del = indexedDB.deleteDatabase(DB_NAME);
          del.onsuccess = () => {
            _dbPromise = null;
            resolve(openDB());
          };
          del.onerror = () => reject(del.error || req.error);
          del.onblocked = () => {};
        } else {
          reject(req.error);
        }
      };
      req.onblocked = () => {};
    };
    tryOpen();
  });
  return _dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const out = fn(store);
        t.oncomplete = () => {
          if (mode === "readwrite") dbBroadcast();
          resolve(out && out.__promise ? out.__promise : out);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

let _channel = null;
function dbBroadcast(type = "dataChanged") {
  if (typeof BroadcastChannel !== "undefined") {
    if (!_channel) _channel = new BroadcastChannel("pfrp-sync");
    try {
      _channel.postMessage({ type, at: Date.now() });
    } catch {}
  }
  try {
    localStorage.setItem("pfrp.sync.ping.v1", type + ":" + Date.now());
  } catch {}
}

function toArray(cursorReq) {
  return new Promise((resolve, reject) => {
    const items = [];
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

function getByIndex(store, indexName, value) {
  return new Promise((resolve, reject) => {
    const idx = store.index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  open: openDB,

  add(storeName, record) {
    return tx(storeName, "readwrite", (store) => {
      const req = store.add(record);
      return { __promise: new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }) };
    });
  },

  put(storeName, record) {
    return tx(storeName, "readwrite", (store) => {
      const req = store.put(record);
      return { __promise: new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }) };
    });
  },

  get(storeName, id) {
    return tx(storeName, "readonly", (store) => {
      const req = store.get(id);
      return { __promise: new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }) };
    });
  },

  getAll(storeName) {
    return tx(storeName, "readonly", (store) => {
      const req = store.getAll();
      return { __promise: new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }) };
    });
  },

  byIndex(storeName, indexName, value) {
    return tx(storeName, "readonly", (store) => {
      const req = getByIndex(store, indexName, value);
      return { __promise: req };
    });
  },

  del(storeName, id) {
    return tx(storeName, "readwrite", (store) => store.delete(id));
  },

  clear(storeName) {
    return tx(storeName, "readwrite", (store) => store.clear());
  },

  async close() {
    const db = await openDB();
    db.close();
    _dbPromise = null;
  },

  async nuke() {
    await this.close();
    dbBroadcast("dataReset");
    return new Promise((resolve) => {
      const del = indexedDB.deleteDatabase(DB_NAME);
      let settled = false;
      const done = () => { if (!settled) { settled = true; _dbPromise = null; resolve(); } };
      del.onsuccess = done;
      del.onerror = () => done();
      del.onblocked = () => {
        // Another tab is holding the DB open; it will release on the reset broadcast.
        setTimeout(done, 400);
      };
    });
  },
};

window.pfrpDB = DB;
