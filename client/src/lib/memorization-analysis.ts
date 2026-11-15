import type { MemorizationRecord } from "./memorization";
import { buildQuranReviewPlan } from "./quran-review-scheduler.ts";

export type QuranFollowUpAlert = {
  kind: "review_due" | "repeated_weakness";
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  message: string;
};

export type QuranAyahStatus = "memorized" | "review_due" | "repeated_weakness" | "unassessed";

export type StudentQuranAnalysis = {
  memorizedAyat: number;
  ayahStatuses: Record<string, QuranAyahStatus>;
  alerts: QuranFollowUpAlert[];
};

function ayahKey(surahNumber: number, ayahNumber: number): string {
  return `${surahNumber}:${ayahNumber}`;
}

function rangesFromAyat(values: number[]): Array<[number, number]> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const ayah of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && ayah <= last[1] + 1) last[1] = Math.max(last[1], ayah);
    else ranges.push([ayah, ayah]);
  }
  return ranges;
}

/**
 * Evidence-based analysis only:
 * - memorization is counted only after an explicit "memorized" result;
 * - review is credited only to overlapping ayat with a later "revised" record;
 * - unrecorded ayat are never labelled unmemorized;
 * - repeated weakness requires low ratings on at least two distinct dates.
 */
export function analyzeStudentQuranRecords(
  records: MemorizationRecord[],
  today = new Date().toISOString().slice(0, 10),
): StudentQuranAnalysis {
  const latestMemorized = new Map<string, string>();
  const lowRatingDates = new Map<string, Set<string>>();

  for (const record of records) {
    const isNewMemorization =
      record.sessionType === "new_memorization" ||
      record.sessionType === "new_hifz";

    if (isNewMemorization && record.recitationResult === "memorized") {
      for (let ayah = record.ayahStart; ayah <= record.ayahEnd; ayah += 1) {
        const key = ayahKey(record.surahNumber, ayah);
        const previous = latestMemorized.get(key);
        if (!previous || record.recordDate > previous) {
          latestMemorized.set(key, record.recordDate);
        }
      }
    }

    if (record.rating <= 2) {
      for (let ayah = record.ayahStart; ayah <= record.ayahEnd; ayah += 1) {
        const key = ayahKey(record.surahNumber, ayah);
        const dates = lowRatingDates.get(key) ?? new Set<string>();
        dates.add(record.recordDate);
        lowRatingDates.set(key, dates);
      }
    }
  }

  const reviewPlan = buildQuranReviewPlan(records, today);
  const dueAyahKeys = new Set(reviewPlan.dueAyahKeys);
  const reviewDueBySurah = new Map<number, number[]>();
  for (const [key] of latestMemorized) {
    const [surahText, ayahText] = key.split(":");
    const surahNumber = Number(surahText);
    const ayahNumber = Number(ayahText);
    if (dueAyahKeys.has(key)) {
      const ayat = reviewDueBySurah.get(surahNumber) ?? [];
      ayat.push(ayahNumber);
      reviewDueBySurah.set(surahNumber, ayat);
    }
  }

  const weakBySurah = new Map<number, number[]>();
  for (const [key, dates] of lowRatingDates) {
    if (dates.size < 2) continue;
    const [surahText, ayahText] = key.split(":");
    const surahNumber = Number(surahText);
    const ayahNumber = Number(ayahText);
    const ayat = weakBySurah.get(surahNumber) ?? [];
    ayat.push(ayahNumber);
    weakBySurah.set(surahNumber, ayat);
  }

  const ayahStatuses: Record<string, QuranAyahStatus> = {};
  for (const [key] of latestMemorized) {
    ayahStatuses[key] = dueAyahKeys.has(key) ? "review_due" : "memorized";
  }
  for (const [key, dates] of lowRatingDates) {
    if (dates.size >= 2) ayahStatuses[key] = "repeated_weakness";
  }

  const alerts: QuranFollowUpAlert[] = [];
  for (const [surahNumber, ayat] of reviewDueBySurah) {
    for (const [ayahStart, ayahEnd] of rangesFromAyat(ayat)) {
      alerts.push({
        kind: "review_due",
        surahNumber,
        ayahStart,
        ayahEnd,
        message: `موضع ${ayahStart === ayahEnd ? ayahStart : `${ayahStart}–${ayahEnd}`}: حان موعد مراجعته وفق مستوى الإتقان وفواصل المراجعة المتباعدة.`,
      });
    }
  }

  for (const [surahNumber, ayat] of weakBySurah) {
    for (const [ayahStart, ayahEnd] of rangesFromAyat(ayat)) {
      alerts.push({
        kind: "repeated_weakness",
        surahNumber,
        ayahStart,
        ayahEnd,
        message: `موضع ${ayahStart === ayahEnd ? ayahStart : `${ayahStart}–${ayahEnd}`}: تكرر فيه تقييم 1 أو 2 في يومين مختلفين على الأقل؛ يحتاج إلى مراجعة المعلم.`,
      });
    }
  }

  return {
    memorizedAyat: latestMemorized.size,
    ayahStatuses,
    alerts: alerts.slice(0, 12),
  };
}
