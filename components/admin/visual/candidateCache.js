// Üretilen görsel adaylarının görüntü verisi (IndexedDB; yalnızca bu tarayıcıda).
// Plan ve seçimler localStorage'da, büyük görüntü verisi burada tutulur; sayfa
// yenilenince adaylar kaybolmaz. Depolama kapalıysa sessizce yalnızca bellekte kalır.

const DB_NAME = "persona-visual";
const STORE = "candidates";
const memory = new Map();

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("yok"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function putCandidate(id, dataUrl) {
  memory.set(id, dataUrl);
  try {
    await run("readwrite", (store) => store.put(dataUrl, id));
  } catch {
    // yalnızca bellekte
  }
}

export async function getCandidate(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const value = await run("readonly", (store) => store.get(id));
    if (value) memory.set(id, value);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function deleteCandidate(id) {
  memory.delete(id);
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    // yok sayılır
  }
}

export function dataUrlToFile(dataUrl, name) {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/webp";
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

export const newOpId = () => `op_${crypto.randomUUID().replace(/-/g, "")}`;

// Görsel tohumu (olay işleyicilerinde kullanılır).
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
