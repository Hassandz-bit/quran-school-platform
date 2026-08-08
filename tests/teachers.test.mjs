import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildTeacherInsert,
  clearTeacherDraft,
  getTeacherDraftStorageKey,
  getTeacherSaveErrorMessage,
  loadTeacherDraft,
  saveTeacherDraft,
  translateTeacherGender,
  translateTeacherStatus,
} from "../client/src/lib/teachers.ts";

const completeForm = {
  branchId: " branch-1 ",
  firstName: "  محمد  ",
  lastName: "  بن سالم  ",
  gender: "male",
  phone: "   ",
  email: "",
  specialization: "   ",
  qualification: "",
  hireDate: "2026-07-22",
  status: "active",
  notes: "   ",
};

const completeDraft = {
  branchId: "branch-1",
  firstName: "محمد",
  lastName: "بن سالم",
  gender: "male",
  phone: "0550000000",
  email: "teacher@example.com",
  specialization: "تحفيظ القرآن",
  qualification: "إجازة",
  hireDate: "2026-07-22",
  status: "active",
  notes: "معلم متطوع",
};

const createMemoryStorage = () => {
  const items = new Map();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    key(index) {
      return [...items.keys()][index] ?? null;
    },
    removeItem(key) {
      items.delete(key);
    },
    setItem(key, value) {
      items.set(key, String(value));
    },
  };
};

const withBrowserStorage = async callback => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const sessionStorage = createMemoryStorage();
  let localStorageAccesses = 0;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage,
      get localStorage() {
        localStorageAccesses += 1;
        return createMemoryStorage();
      },
    },
  });

  try {
    return await callback({
      sessionStorage,
      getLocalStorageAccesses: () => localStorageAccesses,
    });
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }
  }
};

test("creates a separate teacher draft key for each school", () => {
  const firstKey = getTeacherDraftStorageKey("school-1");
  const secondKey = getTeacherDraftStorageKey("school-2");

  assert.equal(firstKey, "quran-school:teacher-draft:school-1");
  assert.notEqual(firstKey, secondKey);
});

test("saves and restores a teacher draft", async () => {
  await withBrowserStorage(({ sessionStorage }) => {
    saveTeacherDraft("school-1", completeDraft);

    assert.notEqual(
      sessionStorage.getItem(getTeacherDraftStorageKey("school-1")),
      null
    );
    assert.deepEqual(loadTeacherDraft("school-1"), completeDraft);
  });
});

test("ignores unknown and sensitive fields in a teacher draft", async () => {
  await withBrowserStorage(({ sessionStorage }) => {
    saveTeacherDraft("school-1", {
      ...completeDraft,
      password: "not-stored",
      token: "not-stored",
      school_id: "not-stored",
      unexpected: "not-stored",
    });

    const stored = JSON.parse(
      sessionStorage.getItem(getTeacherDraftStorageKey("school-1"))
    );
    assert.deepEqual(stored, completeDraft);

    sessionStorage.setItem(
      getTeacherDraftStorageKey("school-1"),
      JSON.stringify({ ...completeDraft, unexpected: "ignored-on-load" })
    );
    assert.deepEqual(loadTeacherDraft("school-1"), completeDraft);
  });
});

test("returns null for malformed teacher draft JSON", async () => {
  await withBrowserStorage(({ sessionStorage }) => {
    sessionStorage.setItem(
      getTeacherDraftStorageKey("school-1"),
      "{malformed-json"
    );

    assert.equal(loadTeacherDraft("school-1"), null);
  });
});

test("rejects an invalid teacher draft status", async () => {
  await withBrowserStorage(({ sessionStorage }) => {
    sessionStorage.setItem(
      getTeacherDraftStorageKey("school-1"),
      JSON.stringify({ ...completeDraft, status: "pending" })
    );

    assert.equal(loadTeacherDraft("school-1"), null);
  });
});

test("rejects an invalid teacher draft gender", async () => {
  await withBrowserStorage(({ sessionStorage }) => {
    sessionStorage.setItem(
      getTeacherDraftStorageKey("school-1"),
      JSON.stringify({ ...completeDraft, gender: "unknown" })
    );

    assert.equal(loadTeacherDraft("school-1"), null);
  });
});

test("clears a saved teacher draft", async () => {
  await withBrowserStorage(() => {
    saveTeacherDraft("school-1", completeDraft);
    clearTeacherDraft("school-1");

    assert.equal(loadTeacherDraft("school-1"), null);
  });
});

test("uses sessionStorage without accessing localStorage", async () => {
  await withBrowserStorage(({ getLocalStorageAccesses }) => {
    saveTeacherDraft("school-1", completeDraft);
    assert.deepEqual(loadTeacherDraft("school-1"), completeDraft);
    clearTeacherDraft("school-1");

    assert.equal(getLocalStorageAccesses(), 0);
  });
});

test("converts optional empty teacher fields to null", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  assert.equal(payload.phone, null);
  assert.equal(payload.email, null);
  assert.equal(payload.specialization, null);
  assert.equal(payload.qualification, null);
  assert.equal(payload.notes, null);
});

test("trims teacher first and last names", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  assert.equal(payload.first_name, "محمد");
  assert.equal(payload.last_name, "بن سالم");
});

test("does not send generated, profile, or audit columns", () => {
  const payload = buildTeacherInsert("school-1", completeForm);

  for (const field of [
    "id",
    "profile_id",
    "created_by",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(Object.hasOwn(payload, field), false);
  }
});

test("translates every teacher status in Arabic and English", () => {
  const statuses = ["active", "inactive", "on_leave", "archived"];

  assert.deepEqual(
    statuses.map(status => translateTeacherStatus(status, "ar")),
    ["نشط", "غير نشط", "في إجازة", "مؤرشف"]
  );
  assert.deepEqual(
    statuses.map(status => translateTeacherStatus(status, "en")),
    ["Active", "Inactive", "On leave", "Archived"]
  );
});

test("translates teacher gender in Arabic and English", () => {
  assert.deepEqual(
    ["male", "female"].map(gender => translateTeacherGender(gender, "ar")),
    ["ذكر", "أنثى"]
  );
  assert.deepEqual(
    ["male", "female"].map(gender => translateTeacherGender(gender, "en")),
    ["Male", "Female"]
  );
});

test("maps an RLS error to a safe permission message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "42501",
      message: "new row violates row-level security policy",
    }),
    "لا تملك صلاحية إضافة المعلمين."
  );
});

test("maps a foreign key error to a safe branch message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "23503",
      message: "insert or update violates foreign key constraint",
    }),
    "تعذر التحقق من الفرع المختار."
  );
});

test("maps a check constraint error to a safe validation message", () => {
  assert.equal(
    getTeacherSaveErrorMessage({
      code: "23514",
      message: "new row violates check constraint",
    }),
    "بعض بيانات المعلم غير صحيحة."
  );
});

test("keeps the teachers route in the centralized role-aware app navigation", async () => {
  const navigationSource = await readFile(
    new URL("../client/src/lib/app-navigation.ts", import.meta.url),
    "utf8"
  );
  assert.match(navigationSource, /id:\s*"teachers"/);
  assert.match(navigationSource, /path:\s*"\/teachers"/);
  assert.match(navigationSource, /canManageSchool = isSchoolAdmin/);

  const shellSource = await readFile(
    new URL("../client/src/components/AppShell.tsx", import.meta.url),
    "utf8"
  );
  assert.match(shellSource, /getAppNavigation/);

  const appSource = await readFile(
    new URL("../client/src/App.tsx", import.meta.url),
    "utf8"
  );
  assert.match(appSource, /<Route path=["']\/teachers["']>/);
});

test("teachers data queries never select every column", async () => {
  const source = await readFile(
    new URL("../client/src/lib/teachers.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /\.select\s*\(\s*["']\*["']\s*\)/);
  assert.equal(source.match(/\.insert\s*\(/g)?.length, 1);
});

test("successful teacher save clears the draft", async () => {
  const source = await readFile(
    new URL("../client/src/pages/AddTeacherForm.tsx", import.meta.url),
    "utf8"
  );
  const successBlock = source.slice(
    source.indexOf("await addTeacher"),
    source.indexOf("} catch (error)")
  );

  assert.match(successBlock, /clearTeacherDraft\(school\.id\)/);
});

test("teacher cancel button clears the draft", async () => {
  const source = await readFile(
    new URL("../client/src/pages/AddTeacherForm.tsx", import.meta.url),
    "utf8"
  );
  const cancelBlock = source.slice(
    source.indexOf("const handleCancel"),
    source.indexOf("const optionalLabel")
  );

  assert.match(cancelBlock, /clearTeacherDraft\(school\.id\)/);
  assert.match(source, /onClick=\{handleCancel\}/);
});

test("teacher save error does not clear the draft", async () => {
  const source = await readFile(
    new URL("../client/src/pages/AddTeacherForm.tsx", import.meta.url),
    "utf8"
  );
  const errorBlock = source.slice(
    source.indexOf("} catch (error)"),
    source.indexOf("} finally")
  );

  assert.doesNotMatch(errorBlock, /clearTeacherDraft/);
});
