import type { AttendanceDraftRow } from "./attendance.ts";

const DATABASE_NAME = "quranos-attendance-offline";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

export type AttendanceDraftScope = {
  userId: string;
  schoolId: string;
  branchId: string;
  classId: string;
  sessionDate: string;
};

export type StoredAttendanceDraft = AttendanceDraftScope & {
  key: string;
  sessionId: string | null;
  rows: AttendanceDraftRow[];
  savedAt: string;
};

function makeKey(scope: AttendanceDraftScope): string {
  return [
    scope.userId,
    scope.schoolId,
    scope.branchId,
    scope.classId,
    scope.sessionDate,
  ].join("::");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("attendance_offline_storage_unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("attendance_offline_database_open_failed"));
    request.onblocked = () => reject(new Error("attendance_offline_database_blocked"));
  });
}

async function withDraftStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      let result: T | undefined;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error("attendance_offline_request_failed"));
      transaction.oncomplete = () => resolve(result as T);
      transaction.onerror = () => reject(transaction.error ?? new Error("attendance_offline_transaction_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("attendance_offline_transaction_aborted"));
    });
  } finally {
    database.close();
  }
}

export async function saveOfflineAttendanceDraft(
  scope: AttendanceDraftScope,
  sessionId: string | null,
  rows: AttendanceDraftRow[]
): Promise<void> {
  if (!scope.userId || !scope.schoolId || !scope.branchId || !scope.classId || !scope.sessionDate) {
    throw new Error("attendance_offline_scope_invalid");
  }

  const draft: StoredAttendanceDraft = {
    ...scope,
    key: makeKey(scope),
    sessionId,
    rows: rows.map(row => ({ ...row })),
    savedAt: new Date().toISOString(),
  };

  await withDraftStore("readwrite", store => store.put(draft));
}

export async function getOfflineAttendanceDraft(
  scope: AttendanceDraftScope
): Promise<StoredAttendanceDraft | null> {
  return (await withDraftStore<StoredAttendanceDraft | undefined>(
    "readonly",
    store => store.get(makeKey(scope))
  )) ?? null;
}

export async function deleteOfflineAttendanceDraft(
  scope: AttendanceDraftScope
): Promise<void> {
  await withDraftStore("readwrite", store => store.delete(makeKey(scope)));
}
