import { describe, expect, test } from "vitest";
import {
  buildSchoolTrackCsv,
  evaluateSchoolTrackScore,
  getCurrentAcademicYear,
  getCurrentTerm,
  getSchoolTrackEvaluationLabel,
  getSchoolTrackPercentage,
  summarizeSchoolTrackResults,
  validateSchoolTrackResult,
  type SchoolTrackResult,
  type SchoolTrackResultInput,
} from "@/lib/school-track";

const input: SchoolTrackResultInput = {
  branchId: "branch-1",
  classId: null,
  studentId: "student-1",
  subject: "الرياضيات",
  assessmentTitle: "الفرض الأول",
  assessmentType: "test",
  academicYear: "2026/2027",
  term: "الفصل الأول",
  assessmentDate: "2026-10-03",
  score: 16,
  maxScore: 20,
  notes: "",
};

function result(overrides: Partial<SchoolTrackResult> = {}): SchoolTrackResult {
  return {
    id: "result-1",
    school_id: "school-1",
    branch_id: "branch-1",
    class_id: null,
    student_id: "student-1",
    subject: "الرياضيات",
    assessment_title: "الفرض الأول",
    assessment_type: "test",
    academic_year: "2026/2027",
    term: "الفصل الأول",
    assessment_date: "2026-10-03",
    score: 16,
    max_score: 20,
    notes: null,
    created_at: "2026-10-03T09:00:00Z",
    updated_at: "2026-10-03T09:00:00Z",
    ...overrides,
  };
}

describe("School track scoring and reports", () => {
  test("normalizes different score scales and assigns advisory bands", () => {
    expect(getSchoolTrackPercentage(16, 20)).toBe(80);
    expect(getSchoolTrackPercentage(80, 100)).toBe(80);
    expect(evaluateSchoolTrackScore(18, 20)).toBe("excellent");
    expect(evaluateSchoolTrackScore(16, 20)).toBe("very_good");
    expect(evaluateSchoolTrackScore(10, 20)).toBe("acceptable");
    expect(getSchoolTrackPercentage(0, 0)).toBe(0);
    expect(getSchoolTrackEvaluationLabel("needs_support", "en")).toBe("Needs support");
  });

  test("uses the school-year start in August and sensible term defaults", () => {
    expect(getCurrentAcademicYear(new Date(2026, 7, 31))).toBe("2026/2027");
    expect(getCurrentAcademicYear(new Date(2026, 6, 31))).toBe("2025/2026");
    expect(getCurrentTerm(new Date(2027, 0, 10))).toBe("الفصل الثاني");
    expect(getCurrentTerm(new Date(2026, 9, 10))).toBe("الفصل الأول");
    expect(getCurrentTerm(new Date(2027, 3, 10))).toBe("الفصل الثالث");
  });

  test("validates score bounds, year, date, type, and user-supplied maximum", () => {
    expect(validateSchoolTrackResult(input)).toBeNull();
    expect(validateSchoolTrackResult({ ...input, score: 21 })).toBe("score_invalid");
    expect(validateSchoolTrackResult({ ...input, score: -1 })).toBe("score_invalid");
    expect(validateSchoolTrackResult({ ...input, academicYear: "26/27" })).toBe("academic_year_invalid");
    expect(validateSchoolTrackResult({ ...input, assessmentDate: "2026-99-41" })).toBe("date_invalid");
    expect(validateSchoolTrackResult({ ...input, assessmentType: "unofficial" as never })).toBe("assessment_type_invalid");
  });

  test("summarizes scores in comparable percentages and isolates student count", () => {
    const summary = summarizeSchoolTrackResults([
      result(),
      result({ id: "result-2", student_id: "student-2", score: 80, max_score: 100 }),
      result({ id: "result-3", subject: "اللغة العربية", score: 8, max_score: 20 }),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.studentCount).toBe(2);
    expect(summary.averagePercentage).toBeCloseTo(66.6667, 3);
    expect(summary.needsSupportCount).toBe(1);
    expect(summary.subjects.find(item => item.subject === "الرياضيات")?.averagePercentage).toBe(80);
  });

  test("exports safe CSV with formula escaping and UTF-8 BOM", () => {
    const csv = buildSchoolTrackCsv([
      result({ notes: "=HYPERLINK(\"https://example.test\")" }),
    ]);
    expect(csv.startsWith("\uFEFF"));
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("\"الرياضيات\"");
  });
});
