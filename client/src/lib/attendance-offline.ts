import type { AttendanceDraftRow, AttendanceRoster, AttendanceScope } from "./attendance.ts";

const DATABASE_NAME = "quranos-attendance-offline";
const DATABASE_VERSION = 2;
const STORE_NAME = "drafts";
const SNAPSHOT_STORE_NAME = "snapshots";

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

type OfflineSnapshotRecord = {
  key: string;
  userId: string;
  schoolId: string;
  kind: "scope" | "roster";
  branchId?: string;
  classId?: string;
  sessionDate?: string;
  payload: AttendanceScope | AttendanceRoster;
  savedAt: string;
};

export type CachedAttendanceRoster = {
  schoolId: string;
  branchId: string;
  classId: string;
  sessionDate: string;
  roster: AttendanceRoster;
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

function makeScopeSnapshotKey(userId: string, schoolId: string): string {
  return \`scope::\${userId}::\${schoolId}\`;
}

function makeRosterSnapshotKey(scope: AttendanceDraftScope): string {
  return \`roster::\${makeKey(scope)}\`;
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
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        const store = database.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
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

async function withSnapshotStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE_NAME, mode);
      const request = run(transaction.objectStore(SNAPSHOT_STORE_NAME));
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
  if (prepareOperation && (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function")) {
    throw new Error("attendance_operation_id_unavailable");
  }

  const database = await openDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
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

export async function saveOfflineAttendanceScope(
  userId: string,
  schoolId: string,
  scope: AttendanceScope
): Promise<void> {
  if (!userId || !schoolId) throw new Error("attendance_offline_scope_invalid");
  const record: OfflineSnapshotRecord = {
    key: makeScopeSnapshotKey(userId, schoolId),
    userId,
    schoolId,
    kind: "scope",
    payload: scope,
    savedAt: new Date().toISOString(),
  };
  await withSnapshotStore("readwrite", store => store.put(record));
}

export async function getOfflineAttendanceScope(
  userId: string,
  schoolId: string
): Promise<{ scope: AttendanceScope; savedAt: string } | null> {
  const record = await withSnapshotStore<OfflineSnapshotRecord | undefined>(
    "readonly",
    store => store.get(makeScopeSnapshotKey(userId, schoolId))
  );
  if (!record || record.kind !== "scope") return null;
  return { scope: record.payload as AttendanceScope, savedAt: record.savedAt };
}

export async function saveOfflineAttendanceRoster(
  scope: AttendanceDraftScope,
  roster: AttendanceRoster
): Promise<void> {
  if (!scope.userId || !scope.schoolId || !scope.branchId || !scope.classId || !scope.sessionDate) {
    throw new Error("attendance_offline_scope_invalid");
  }
  const record: OfflineSnapshotRecord = {
    key: makeRosterSnapshotKey(scope),
    userId: scope.userId,
    schoolId: scope.schoolId,
    branchId: scope.branchId,
    classId: scope.classId,
    sessionDate: scope.sessionDate,
    kind: "roster",
    payload: roster,
    savedAt: new Date().toISOString(),
  };
  await withSnapshotStore("readwrite", store => store.put(record));
}

export async function getOfflineAttendanceRoster(
  scope: AttendanceDraftScope
): Promise<CachedAttendanceRoster | null> {
  const record = await withSnapshotStore<OfflineSnapshotRecord | undefined>(
    "readonly",
    store => store.get(makeRosterSnapshotKey(scope))
  );
  if (!record || record.kind !== "roster") return null;
  return {
    schoolId: record.schoolId,
    branchId: record.branchId ?? "",
    classId: record.classId ?? "",
    sessionDate: record.sessionDate ?? "",
    roster: record.payload as AttendanceRoster,
    savedAt: record.savedAt,
  };
}

export async function listOfflineAttendanceRosters(
  userId: string
): Promise<CachedAttendanceRoster[]> {
  if (!userId) return [];
  const records = await withSnapshotStore<OfflineSnapshotRecord[]>(
    "readonly",
    store => store.index("userId").getAll(userId)
  );
  return records
    .filter(record => record.kind === "roster")
    .map(record => ({
      schoolId: record.schoolId,
      branchId: record.branchId ?? "",
      classId: record.classId ?? "",
      sessionDate: record.sessionDate ?? "",
      roster: record.payload as AttendanceRoster,
      savedAt: record.savedAt,
    }))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

export async function clearOfflineAttendanceForUser(userId: string): Promise<void> {
  if (!userId) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, SNAPSHOT_STORE_NAME], "readwrite");
      for (const storeName of [STORE_NAME, SNAPSHOT_STORE_NAME]) {
        const store = transaction.objectStore(storeName);
        const request = store.index("userId").getAllKeys(userId);
        request.onsuccess = () => {
          for (const key of request.result) store.delete(key);
        };
        request.onerror = () => reject(request.error ?? new Error("attendance_offline_cleanup_failed"));
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("attendance_offline_cleanup_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("attendance_offline_cleanup_failed"));
    });
  } finally {
    database.close();
  }
}
