import { describe, expect, it } from "vitest";
import { translateVisibleText } from "../client/src/lib/ui-translation";

describe("legacy page translation bridge", () => {
  it("translates exact page labels and preserves surrounding whitespace", () => {
    expect(translateVisibleText("  ملاحظات جلسة التسميع الحالية  ", "en"))
      .toBe("  Current recitation session notes  ");
  });

  it("translates known sentence fragments without corrupting Arabic words", () => {
    expect(translateVisibleText("تم حفظ الملاحظات", "en"))
      .toBe("Done Save notes");
    expect(translateVisibleText("المستخدم", "en")).toBe("المستخدم");
  });

  it("keeps Arabic copy unchanged for the Arabic locale", () => {
    expect(translateVisibleText("إنشاء وإرسال إشعار", "ar"))
      .toBe("إنشاء وإرسال إشعار");
  });
});
