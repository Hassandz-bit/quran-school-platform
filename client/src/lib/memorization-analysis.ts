import type { MemorizationRecord } from "./memorization";

export type QuranFollowUpAlert = {
  kind: "review_due" | "repeated_weakness";
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  message: string;
};

export type StudentQuranAnalysis = {
  memorizedAyat: number;
  alerts: QuranFollowUpAlert[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(older: string, newer: string): number {
  return Math.max(0, Math.floor((dayNumber(newer) - dayNumber(older)) / DAY_MS));
}

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
  const latestReviewed = new Map<string, string>();
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

    const isSuccessfulReview =
      (record.sessionType === "near_revision" ||
        record.sessionType === "distant_revision") &&
      record.recitationResult === "revised";

    if (isSuccessfulReview) {
      for (let ayah = record.ayahStart; ayah <= record.ayahEnd; ayah += 1) {
        const key = ayahKey(record.surahNumber, ayah);
        const previous = latestReviewed.get(key);
        if (!previous || record.recordDate > previous) {
          latestReviewed.set(key, record.recordDate);
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

  const reviewDueBySurah = new Map<number, number[]>();
  for (const [key, memorizedDate] of latestMemorized) {
    const [surahText, ayahText] = key.split(":");
    const surahNumber = Number(surahText);
    const ayahNumber = Number(ayahText);
    const reviewedDate = latestReviewed.get(key);
    const lastEvidenceDate =
      reviewedDate && reviewedDate > memorizedDate ? reviewedDate : memorizedDate;

    if (daysBetween(lastEvidenceDate, today) >= 14) {
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

  const alerts: QuranFollowUpAlert[] = [];
  for (const [surahNumber, ayat] of reviewDueBySurah) {
    for (const [ayahStart, ayahEnd] of rangesFromAyat(ayat)) {
      alerts.push({
        kind: "review_due",
        surahNumber,
        ayahStart,
        ayahEnd,
        message: `موضع ${ayahStart === ayahEnd ? ayahStart : `${ayahStart}–${ayahEnd}`}: لم يظهر له تسجيل مراجعة ناجح خلال آخر 14 يومًا أو أكثر بعد آخر تسجيل استظهار.`,
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
    alerts: alerts.slice(0, 12),
  };
}
