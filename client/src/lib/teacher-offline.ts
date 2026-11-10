import type {
  MemorizationDraft,
  MemorizationRecord,
  MemorizationScope,
  MemorizationWorkspace,
} from "./memorization.ts";

const DATABASE_NAME = "quranos-teacher-offline";
const DATABASE_VERSION = 1;
const SNAPSHOTS = "snapshots";
const DRAFTS = "drafts";

export type TeacherOfflineScope = {
  userId: string;
  schoolId: string;
  branchId: string;
  classId: string;
  recordDate: string;
};

export type StoredMemorizationDraft = TeacherOfflineScope & {
  key: string;
  draftId: string;
  operationId: string;
  studentId: string;
  draft: MemorizationDraft;
  state: "draft" | "pending" | "syncing" | "conflict" | "failed";
  error: string | null;
  savedAt: string;
};

type Snapshot = {
  key: string;
  userId: string;
  schoolId: string;
  branchId?: string;
  classId?: string;
  kind: "scope" | "workspace" | "records";
  payload: unknown;
  savedAt: string;
};

function scopeKey(scope: TeacherOfflineScope, kind: string): string {
  return [kind, scope.userId, scope.schoolId, scope.branchId, scope.classId].join("::");
}

function draftKey(scope: TeacherOfflineScope, studentId: string, draftId = "individual"): string {
  return [scope.userId, scope.schoolId, scope.branchId, scope.classId, scope.recordDate, studentId, draftId].join("::");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("teacher_offline_storage_unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const store = db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains(DRAFTS)) {
        const store = db.createObjectStore(DRAFTS, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("teacher_offline_database_open_failed"));
    request.onblocked = () => reject(new Error("teacher_offline_database_blocked"));
  });
}

async function readWrite<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = action(tx.objectStore(storeName));
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error ?? new Error("teacher_offline_storage_request_failed"));
      tx.oncomplete = () => resolve(value!);
      tx.onerror = () => reject(tx.error ?? new Error("teacher_offline_storage_transaction_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("teacher_offline_storage_transaction_aborted"));
    });
  } finally {
    db.close();
  }
}

async function putSnapshot<T>(scope: TeacherOfflineScope, kind: Snapshot["kind"], payload: T): Promise<void> {
  const snapshot: Snapshot = {
    key: scopeKey(scope, kind),
    userId: scope.userId,
    schoolId: scope.schoolId,
    branchId: scope.branchId,
    classId: scope.classId,
    kind,
    payload,
    savedAt: new Date().toISOString(),
  };
  await readWrite(SNAPSHOTS, "readwrite", store => store.put(snapshot));
}

async function getSnapshot<T>(scope: TeacherOfflineScope, kind: Snapshot["kind"]): Promise<{ payload: T; savedAt: string } | null> {
  const snapshot = await readWrite<Snapshot | undefined>(SNAPSHOTS, "readonly", store => store.get(scopeKey(scope, kind)));
  return snapshot ? { payload: snapshot.payload as T, savedAt: snapshot.savedAt } : null;
}

export async function saveTeacherMemorizationScope(userId: string, schoolId: string, payload: MemorizationScope): Promise<void> {
  const scope: TeacherOfflineScope = { userId, schoolId, branchId: "_", classId: "_", recordDate: "_" };
  await putSnapshot(scope, "scope", payload);
}

export async function getTeacherMemorizationScope(userId: string, schoolId: string): Promise<{ payload: MemorizationScope; savedAt: string } | null> {
  const scope: TeacherOfflineScope = { userId, schoolId, branchId: "_", classId: "_", recordDate: "_" };
  return getSnapshot<MemorizationScope>(scope, "scope");
}

export async function saveTeacherMemorizationWorkspace(scope: TeacherOfflineScope, payload: MemorizationWorkspace): Promise<void> {
  await putSnapshot(scope, "workspace", payload);
}

export async function getTeacherMemorizationWorkspace(scope: TeacherOfflineScope): Promise<{ payload: MemorizationWorkspace; savedAt: string } | null> {
  return getSnapshot<MemorizationWorkspace>(scope, "workspace");
}

export async function saveTeacherMemorizationRecords(scope: TeacherOfflineScope, studentId: string, payload: MemorizationRecord[]): Promise<void> {
  await putSnapshot({ ...scope, classId: scope.classId + "::" + studentId }, "records", payload);
}

export async function getTeacherMemorizationRecords(scope: TeacherOfflineScope, studentId: string): Promise<{ payload: MemorizationRecord[]; savedAt: string } | null> {
  return getSnapshot<MemorizationRecord[]>({ ...scope, classId: scope.classId + "::" + studentId }, "records");
}

export async function saveTeacherMemorizationDraft(
  scope: TeacherOfflineScope,
  studentId: string,
  draft: MemorizationDraft,
  operationId?: string,
  draftId = "individual",
  queueForSync = false
): Promise<StoredMemorizationDraft> {
  const key = draftKey(scope, studentId, draftId);
  const serialized = JSON.stringify(draft);
  const db = await openDatabase();
  try {
    return await new Promise<StoredMemorizationDraft>((resolve, reject) => {
      const tx = db.transaction(DRAFTS, "readwrite");
      const store = tx.objectStore(DRAFTS);
      const request = store.get(key);
      let next: StoredMemorizationDraft | null = null;
      request.onsuccess = () => {
        const previous = request.result as StoredMemorizationDraft | undefined;
        const samePayload = previous && JSON.stringify(previous.draft) === serialized;
        next = {
          key,
          draftId,
          ...scope,
          studentId,
          operationId: samePayload ? previous.operationId : operationId ?? crypto.randomUUID(),
          draft,
          state: queueForSync ? "pending" : samePayload ? previous?.state ?? "draft" : "draft",
          error: queueForSync ? null : samePayload ? previous?.error ?? null : null,
          savedAt: new Date().toISOString(),
        };
        store.put(next);
      };
      request.onerror = () => reject(request.error ?? new Error("teacher_offline_draft_read_failed"));
      tx.oncomplete = () => next ? resolve(next) : reject(new Error("teacher_offline_draft_write_failed"));
      tx.onerror = () => reject(tx.error ?? new Error("teacher_offline_draft_write_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("teacher_offline_draft_write_aborted"));
    });
  } finally {
    db.close();
  }
}

export async function getTeacherMemorizationDraft(scope: TeacherOfflineScope, studentId: string, draftId = "individual"): Promise<StoredMemorizationDraft | null> {
  return (await readWrite<StoredMemorizationDraft | undefined>(DRAFTS, "readonly", store => store.get(draftKey(scope, studentId, draftId)))) ?? null;
}

export async function updateTeacherMemorizationDraftState(
  scope: TeacherOfflineScope,
  studentId: string,
  state: StoredMemorizationDraft["state"],
  error: string | null = null,
  draftId = "individual"
): Promise<void> {
  const key = draftKey(scope, studentId, draftId);
  const draft = await readWrite<StoredMemorizationDraft | undefined>(DRAFTS, "readonly", store => store.get(key));
  if (!draft) return;
  await readWrite(DRAFTS, "readwrite", store => store.put({ ...draft, state, error, savedAt: new Date().toISOString() }));
}

export async function deleteTeacherMemorizationDraft(scope: TeacherOfflineScope, studentId: string, draftId = "individual"): Promise<void> {
  await readWrite(DRAFTS, "readwrite", store => store.delete(draftKey(scope, studentId, draftId)));
}

export async function listTeacherMemorizationDrafts(userId: string): Promise<StoredMemorizationDraft[]> {
  if (!userId) return [];
  const rows = await readWrite<StoredMemorizationDraft[]>(DRAFTS, "readonly", store => store.index("userId").getAll(userId));
  return rows.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}
