export interface Reputation {
  street: number;
  rally: number;
  circuit: number;
  offroad: number;
  drag: number;
}

export interface SaveData {
  version: 1;
  money: number;
  rep: Reputation;
  racesWon: number;
  bestRace: number | null;
  bestLap: number | null;
  seenIntro: boolean;
}

export const defaultSave = (): SaveData => ({
  version: 1,
  money: 500,
  rep: { street: 0, rally: 0, circuit: 0, offroad: 0, drag: 0 },
  racesWon: 0,
  bestRace: null,
  bestLap: null,
  seenIntro: false,
});

const DB = 'night-racers';
const STORE = 'saves';
const KEY = 'slot1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persistent progress in IndexedDB (falls back to defaults if storage is unavailable). */
export async function loadSave(): Promise<SaveData> {
  try {
    const db = await openDb();
    const data = await new Promise<SaveData | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as SaveData | undefined);
      req.onerror = () => reject(req.error);
    });
    const def = defaultSave();
    if (!data) return def;
    const { maths: _dropped, ...rest } = data as SaveData & { maths?: unknown }; // older saves had maths progress
    return { ...def, ...rest, rep: { ...def.rep, ...rest.rep } };
  } catch {
    return defaultSave();
  }
}

let pending: number | undefined;
export function writeSave(data: SaveData) {
  if (pending !== undefined) clearTimeout(pending);
  pending = window.setTimeout(async () => {
    pending = undefined;
    try {
      const db = await openDb();
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, KEY);
    } catch {
      /* storage unavailable (private mode) — progress lasts for this session only */
    }
  }, 250);
}
