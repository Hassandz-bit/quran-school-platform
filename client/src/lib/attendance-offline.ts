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
  operationId: string | null;
  operationPayload: string | null;
  sessionId: string | null;
  rows: AttendanceDraftRow[];
  savedAt: string;
};

function makeOperationPayload(rows: AttendanceDraftRow[]): string {
  return JSON.stringify(rows.map(row => ({
    student_id: row.id,
    status: row.status,
    arrival_time: row.status === "late" && row.arrivalTime ? row.arrivalTime : null,
    note: row.note.trim() || null,
    expected_updated_at: row.baseUpdatedAt ?? null,
  })));
}

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
  rows: AttendanceDraftRow[],
  prepareOperation = false
): Promise<string | null> {
  if (!scope.userId || !scope.schoolId || !scope.branchId || !scope.classId || !scope.sessionDate) {
    throw new Error("attendance_offline_scope_invalid");
  }
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("attendance_operation_id_unavailable");
  }

  const database = await openDatabase();
  try {
    return await new Promise<string>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const key = makeKey(scope);
      const lookup = store.get(key);
      let operationId: string | null = null;

      lookup.onsuccess = () => {
        const existing = lookup.result as StoredAttendanceDraft | undefined;
        const operationPayload = makeOperationPayload(rows);
        const payloadUnchanged = existing?.operationPayload === operationPayload;
        operationId = prepareOperation
          ? (payloadUnchanged && existing?.operationId ? existing.operationId : crypto.randomUUID())
          : (payloadUnchanged ? existing?.operationId ?? null : null);
        const draft: StoredAttendanceDraft = {
          ...scope,
          key,
          operationId,
          operationPayload: prepareOperation ? operationPayload : (payloadUnchanged ? existing?.operationPayload ?? null : null),
          sessionId,
          rows: rows.map(row => ({ ...row })),
          savedAt: new Date().toISOString(),
        };
        store.put(draft);
      };
      lookup.onerror = () => reject(lookup.error ?? new Error("attendance_offline_request_failed"));
      transaction.oncomplete = () => {
        resolve(operationId);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("attendance_offline_transaction_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("attendance_offline_transaction_aborted"));
    });
  } finally {
    database.close();
  }
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
