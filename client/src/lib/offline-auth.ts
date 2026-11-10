import type { School, SchoolMembership, SchoolProfile, SchoolRole } from "./authorization.ts";

export type CachedAuthorization = {
  userId: string;
  profile: SchoolProfile;
  membership: SchoolMembership;
  school: School;
  roles: SchoolRole[];
  activeRoleCodes: string[];
  isSchoolAdmin: boolean;
  savedAt: string;
};

const DB_NAME = "quranos-offline-auth";
const STORE = "authorization";

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("offline_auth_storage_unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline_auth_database_open_failed"));
  });
}

export async function cacheAuthorization(userId: string, authorization: Omit<CachedAuthorization, "userId" | "savedAt">): Promise<void> {
  if (!userId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...authorization, userId, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("offline_auth_write_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("offline_auth_write_aborted"));
    });
  } finally {
    db.close();
  }
}

export async function getCachedAuthorization(userId: string): Promise<CachedAuthorization | null> {
  if (!userId) return null;
  const db = await openDb();
  try {
    const cached = await new Promise<CachedAuthorization | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(userId);
      request.onsuccess = () => resolve((request.result as CachedAuthorization | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("offline_auth_read_failed"));
    });
    // Do not restore an indefinitely old school context on a shared device.
    const ageMs = cached ? Date.now() - Date.parse(cached.savedAt) : Infinity;
    return cached && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 30 * 24 * 60 * 60 * 1000
      ? cached
      : null;
  } finally {
    db.close();
  }
}

export async function clearCachedAuthorization(userId: string): Promise<void> {
  if (!userId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("offline_auth_delete_failed"));
    });
  } finally {
    db.close();
  }
}
