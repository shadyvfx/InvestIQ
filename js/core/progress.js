// Lesson progress and quiz grading. Pure functions shared by the progress
// service (mock today, Flask later) and the UI.

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const DIFFICULTY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** A quiz is passed with at least two thirds of the answers correct. */
export const PASS_RATIO = 2 / 3;

export function levelRank(level) {
  const index = DIFFICULTY_LEVELS.indexOf(level);
  return index === -1 ? 0 : index;
}

export function emptyRecord() {
  return { sectionsDone: [], quizBest: null, quizPassed: false, attempts: 0, lastSection: null, startedAt: null, completedAt: null, updatedAt: null };
}

/** Progress for one lesson: sections read plus the knowledge check. */
export function lessonProgress(lesson, record) {
  const sectionIds = new Set(lesson.sections.map((section) => section.id));
  const sectionsDone = (record?.sectionsDone || []).filter((id) => sectionIds.has(id)).length;
  const steps = lesson.sections.length + 1;
  const done = sectionsDone + (record?.quizPassed ? 1 : 0);
  let status = 'not-started';
  if (record?.completedAt) status = 'completed';
  else if (done > 0 || record?.startedAt) status = 'in-progress';
  return { done, steps, ratio: steps ? done / steps : 0, status, sectionsDone };
}

export function gradeQuiz(quiz, answers = {}) {
  const results = quiz.map((question) => {
    const chosen = answers[question.id];
    return { id: question.id, chosen, correctIndex: question.correct, correct: chosen === question.correct };
  });
  const score = results.filter((result) => result.correct).length;
  const total = quiz.length;
  return { score, total, passed: total > 0 && score / total >= PASS_RATIO - 1e-9, results };
}

/** Returns an updated record after a section is marked complete. */
export function completeSection(record, sectionId, now = Date.now()) {
  const base = record || emptyRecord();
  const sectionsDone = base.sectionsDone.includes(sectionId) ? base.sectionsDone : [...base.sectionsDone, sectionId];
  return { ...base, sectionsDone, lastSection: sectionId, startedAt: base.startedAt ?? now, updatedAt: now };
}

/** Returns an updated record after a quiz attempt. Passing completes the lesson. */
export function recordQuizAttempt(record, lesson, grade, now = Date.now()) {
  const base = record || emptyRecord();
  const quizBest = base.quizBest === null ? grade.score : Math.max(base.quizBest, grade.score);
  const next = {
    ...base,
    quizBest,
    attempts: base.attempts + 1,
    startedAt: base.startedAt ?? now,
    updatedAt: now,
  };
  if (grade.passed) {
    next.quizPassed = true;
    next.sectionsDone = lesson.sections.map((section) => section.id);
    next.completedAt = base.completedAt ?? now;
  }
  return next;
}

/** Totals across all lessons. */
export function overallProgress(lessons, records = {}) {
  let completed = 0;
  let inProgress = 0;
  let ratioSum = 0;
  for (const lesson of lessons) {
    const progress = lessonProgress(lesson, records[lesson.id]);
    if (progress.status === 'completed') completed += 1;
    else if (progress.status === 'in-progress') inProgress += 1;
    ratioSum += progress.ratio;
  }
  return {
    completed,
    inProgress,
    total: lessons.length,
    ratio: lessons.length ? ratioSum / lessons.length : 0,
  };
}

/**
 * Suggests what to study next: lessons already started come first, then
 * unstarted lessons at or below the chosen difficulty in course order, then
 * the rest.
 */
export function suggestLessons(lessons, records = {}, difficulty = 'beginner', count = 3) {
  const cap = levelRank(difficulty);
  const scored = lessons
    .map((lesson, order) => ({ lesson, order, progress: lessonProgress(lesson, records[lesson.id]) }))
    .filter(({ progress }) => progress.status !== 'completed')
    .map((item) => {
      const rank = levelRank(item.lesson.difficulty);
      let group = 2;
      if (item.progress.status === 'in-progress') group = 0;
      else if (rank <= cap) group = 1;
      const updated = records[item.lesson.id]?.updatedAt || 0;
      return { ...item, group, rank, updated };
    })
    .sort((a, b) => a.group - b.group || b.updated - a.updated || a.order - b.order);
  return scored.slice(0, count).map(({ lesson, progress }) => ({ lesson, progress }));
}
