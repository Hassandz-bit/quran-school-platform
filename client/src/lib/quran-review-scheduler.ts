import type { MemorizationRecord } from "./memorization";

export type QuranReviewPriority = "urgent" | "reinforce" | "maintenance";

export type QuranReviewTask = {
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  ayahCount: number;
  repetitions: number;
  priority: QuranReviewPriority;
  reason: string;
  overdueDays: number;
};

export type QuranReviewPlan = {
  dueAyat: number;
  scheduledAyat: number;
  remainingAyat: number;
  tasks: QuranReviewTask[];
  nextReviewDate: string | null;
  dailyCapacity: number;
};

type AyahState = {
  surahNumber: number;
  ayahNumber: number;
  lastAttemptDate: string;
  nextReviewDate: string;
  streak: number;
  priority: QuranReviewPriority;
  repetitions: number;
  reason: string;
  overdueDays: number;
};

const DAY_MS = 86_400_000;
const STRONG_INTERVALS = [1, 3, 7, 14, 30, 60, 90];
const ACCEPTABLE_INTERVALS = [1, 2, 4, 7, 14, 30];

function dateNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDays(value: string, days: number): string {
  const date = new Date(dateNumber(value) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  return Math.max(0, Math.floor((dateNumber(to) - dateNumber(from)) / DAY_MS));
}

function isNewMemorization(record: MemorizationRecord): boolean {
  return (record.sessionType === "new_memorization" || record.sessionType === "new_hifz") &&
    record.recitationResult === "memorized";
}

function isRevision(record: MemorizationRecord): boolean {
  return record.sessionType === "near_revision" || record.sessionType === "distant_revision";
}

function reviewQuality(record: MemorizationRecord): "strong" | "acceptable" | "weak" | "failed" {
  if (record.recitationResult !== "revised") return "failed";
  if (record.rating <= 2 || record.errorsCount >= 4) return "weak";
  if (record.rating >= 4 && record.errorsCount <= 1) return "strong";
  return "acceptable";
}

function scheduleAyah(
  surahNumber: number,
  ayahNumber: number,
  records: MemorizationRecord[],
  today: string,
): AyahState | null {
  const ordered = records
    .filter(record => record.surahNumber === surahNumber &&
      record.ayahStart <= ayahNumber && record.ayahEnd >= ayahNumber)
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate) ||
      a.createdAt.localeCompare(b.createdAt));

  const memorization = ordered.filter(isNewMemorization).at(-1);
  if (!memorization) return null;

  const events = ordered.filter(record =>
    isRevision(record) && record.recordDate >= memorization.recordDate
  );
  let streak = 0;
  let lastAttempt = memorization.recordDate;
  let interval = 1;
  let priority: QuranReviewPriority = "reinforce";
  let repetitions = 2;
  let reason = "مراجعة أولى بعد الحفظ الجديد";

  for (const event of events) {
    const quality = reviewQuality(event);
    lastAttempt = event.recordDate;
    if (quality === "strong") {
      streak += 1;
      interval = STRONG_INTERVALS[Math.min(streak - 1, STRONG_INTERVALS.length - 1)];
      priority = "maintenance";
      repetitions = 1;
      reason = "إتقان جيد؛ نزيد الفاصل تدريجيًا";
    } else if (quality === "acceptable") {
      streak += 1;
      interval = ACCEPTABLE_INTERVALS[Math.min(streak - 1, ACCEPTABLE_INTERVALS.length - 1)];
      priority = "reinforce";
      repetitions = 2;
      reason = "أداء مقبول؛ تثبيت المحفوظ بتكرارين";
    } else {
      streak = 0;
      interval = 1;
      priority = "urgent";
      repetitions = 3;
      reason = quality === "failed"
        ? "لم تتم المراجعة؛ إعادة قريبة مع ثلاث مرات تسميع"
        : "أخطاء أو تقييم منخفض؛ تثبيت مكثف بثلاث مرات";
    }
  }

  const nextReviewDate = addDays(lastAttempt, interval);
  const overdueDays = dayDifference(nextReviewDate, today);
  return {
    surahNumber,
    ayahNumber,
    lastAttemptDate: lastAttempt,
    nextReviewDate,
    streak,
    priority: overdueDays > 0 && priority !== "urgent" ? "reinforce" : priority,
    repetitions,
    reason,
    overdueDays,
  };
}

/**
 * Builds a deterministic spaced-review queue from recorded memorization and revision.
 * A strong review expands intervals; weak/failed reviews reset to next-day reinforcement.
 * The daily workload is capped, with weak passages receiving the smallest first batch.
 */
export function buildQuranReviewPlan(
  records: MemorizationRecord[],
  today = new Date().toISOString().slice(0, 10),
  dailyCapacity = 20,
): QuranReviewPlan {
  const capacity = Math.max(1, Math.floor(dailyCapacity));
  const latestMemorized = new Map<string, { surahNumber: number; ayahNumber: number }>();

  for (const record of records) {
    if (!isNewMemorization(record)) continue;
    for (let ayah = record.ayahStart; ayah <= record.ayahEnd; ayah += 1) {
      latestMemorized.set(`${record.surahNumber}:${ayah}`, {
        surahNumber: record.surahNumber,
        ayahNumber: ayah,
      });
    }
  }

  const states = [...latestMemorized.values()]
    .map(item => scheduleAyah(item.surahNumber, item.ayahNumber, records, today))
    .filter((item): item is AyahState => item !== null);

  const due = states.filter(item => item.nextReviewDate <= today)
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, reinforce: 1, maintenance: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] ||
        b.overdueDays - a.overdueDays ||
        a.surahNumber - b.surahNumber ||
        a.ayahNumber - b.ayahNumber;
    });

  const selected: AyahState[] = [];
  let used = 0;
  for (const item of due) {
    if (used >= capacity) break;
    selected.push(item);
    used += 1;
  }

  const tasks: QuranReviewTask[] = [];
  for (const item of selected) {
    const last = tasks[tasks.length - 1];
    if (last &&
      last.surahNumber === item.surahNumber &&
      last.ayahEnd + 1 === item.ayahNumber &&
      last.repetitions === item.repetitions &&
      last.priority === item.priority &&
      last.ayahCount < 10
    ) {
      last.ayahEnd = item.ayahNumber;
      last.ayahCount += 1;
      last.overdueDays = Math.max(last.overdueDays, item.overdueDays);
    } else {
      tasks.push({
        surahNumber: item.surahNumber,
        ayahStart: item.ayahNumber,
        ayahEnd: item.ayahNumber,
        ayahCount: 1,
        repetitions: item.repetitions,
        priority: item.priority,
        reason: item.reason,
        overdueDays: item.overdueDays,
      });
    }
  }

  const futureDates = states
    .filter(item => item.nextReviewDate > today)
    .map(item => item.nextReviewDate)
    .sort();

  return {
    dueAyat: due.length,
    scheduledAyat: selected.length,
    remainingAyat: Math.max(0, due.length - selected.length),
    tasks,
    nextReviewDate: futureDates[0] ?? null,
    dailyCapacity: capacity,
  };
}
