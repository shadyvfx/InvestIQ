// Lesson catalog and learning progress.
//
// The catalog is bundled with the frontend (data/mockLessons.js). Progress
// records are stored per lesson. Grading rules live in core/progress.js so a
// backend can apply exactly the same logic.
//
// FLASK: implement these endpoints to switch to the remote adapter
//   GET    /api/progress                              -> { lessons: { [lessonId]: ProgressRecord } }
//   POST   /api/progress/:lessonId/sections/:sectionId -> { record }
//   POST   /api/progress/:lessonId/quiz { answers }    -> { grade, record }
//   DELETE /api/progress/:lessonId                     -> 204
// If lessons move to the backend too, add GET /api/lessons and load the
// catalog once at startup instead of importing it.

import { isMock } from '../config.js';
import { api } from './apiClient.js';
import { getState, updateSlice } from '../state.js';
import { CATEGORIES, LESSONS, getLesson, getCategory } from '../data/mockLessons.js';
import { completeSection, gradeQuiz, recordQuizAttempt, lessonProgress, overallProgress, suggestLessons } from '../core/progress.js';

const mock = {
  async completeSection(lessonId, sectionId) {
    const record = getState().learning.lessons[lessonId];
    return { record: completeSection(record, sectionId) };
  },

  async submitQuiz(lessonId, answers, lessonContent) {
    const lesson = lessonContent || getLesson(lessonId);
    if (!lesson?.quiz?.length) throw new Error('That lesson content is unavailable.');
    const grade = gradeQuiz(lesson.quiz, answers);
    const record = recordQuizAttempt(getState().learning.lessons[lessonId], lesson, grade);
    return { grade, record };
  },

  async resetLesson() {
    return null;
  },
};

const remote = {
  getProgress: () => api.get('/progress'),
  completeSection: (lessonId, sectionId) =>
    api.post(`/progress/${encodeURIComponent(lessonId)}/sections/${encodeURIComponent(sectionId)}`, {}),
  submitQuiz: (lessonId, answers) => api.post(`/progress/${encodeURIComponent(lessonId)}/quiz`, { answers }),
  resetLesson: (lessonId) => api.delete(`/progress/${encodeURIComponent(lessonId)}`),
};

const adapter = isMock() ? mock : remote;

function commitRecord(lessonId, record) {
  updateSlice(
    'learning',
    (learning) => {
      const lessons = { ...learning.lessons };
      if (record) lessons[lessonId] = record;
      else delete lessons[lessonId];
      return { ...learning, lessons };
    },
    'learning/record',
  );
}

// ---------------------------------------------------------------------------
// Public API

export const catalog = { categories: CATEGORIES, lessons: LESSONS, getLesson, getCategory };

/** Loads saved progress from the backend at startup (no-op in mock mode). */
export async function loadProgress() {
  if (isMock()) return;
  const { lessons } = await remote.getProgress();
  updateSlice('learning', (learning) => ({ ...learning, lessons: lessons || {} }), 'learning/loaded');
}

export async function markSectionComplete(lessonId, sectionId) {
  const { record } = await adapter.completeSection(lessonId, sectionId);
  commitRecord(lessonId, record);
  return record;
}

/**
 * Grades a knowledge check. Passing (two thirds or better) completes the lesson.
 * @returns {Promise<{grade: {score:number,total:number,passed:boolean,results:Array}, record: object, completedNow: boolean}>}
 */
export async function submitQuiz(lessonId, answers, lessonContent) {
  const wasCompleted = Boolean(getState().learning.lessons[lessonId]?.completedAt);
  const { grade, record } = await adapter.submitQuiz(lessonId, answers, lessonContent);
  commitRecord(lessonId, record);
  return { grade, record, completedNow: grade.passed && !wasCompleted };
}

export async function resetLesson(lessonId) {
  await adapter.resetLesson(lessonId);
  commitRecord(lessonId, null);
}

export function progressFor(lessonId, state = getState()) {
  const lesson = getLesson(lessonId);
  return lesson ? lessonProgress(lesson, state.learning.lessons[lessonId]) : null;
}

export function overall(state = getState()) {
  return overallProgress(LESSONS, state.learning.lessons);
}

export function suggestions(count = 3, state = getState()) {
  return suggestLessons(LESSONS, state.learning.lessons, state.preferences.difficulty, count);
}

/** The lesson after this one in course order, if any. */
export function nextLesson(lessonId) {
  const index = LESSONS.findIndex((lesson) => lesson.id === lessonId);
  return index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1] : null;
}
