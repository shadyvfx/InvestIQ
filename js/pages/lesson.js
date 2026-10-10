// Lesson detail: one section at a time with section navigation, then a
// knowledge check. Passing the check (two of three or better) completes the
// lesson. Progress is kept through progressService.

import { html, raw, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch } from '../state.js';
import { markdownToHTML } from '../utils/markdown.js';
import { plural } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { levelBadge, lessonStatus, meter, emptyState } from '../components/ui.js';
import { renderFigure, renderWidget, mountWidgets } from '../components/lessonWidgets.js';
import { toast, notify, announce } from '../components/notifications.js';
import { catalog, markSectionComplete, submitQuiz, progressFor, nextLesson } from '../services/progressService.js';
import { gradeQuiz, PASS_RATIO } from '../core/progress.js';
import { href } from '../router.js';
import { api, ApiError } from '../services/apiClient.js';
import { accountLinks } from '../components/accountGate.js';

const CALLOUT_ICONS = { tip: 'bulb', key: 'key', warn: 'alert' };

function renderBlock(block) {
  switch (block.type) {
    case 'md':
      return html`<div class="prose">${raw(markdownToHTML(block.text))}</div>`;
    case 'callout':
      return html`<aside class="callout${block.tone === 'warn' ? ' callout--warn' : ''}">
        ${icon(CALLOUT_ICONS[block.tone] || 'info', { className: 'callout__icon' })}
        <div><p class="callout__title">${block.title}</p><p>${block.text}</p></div>
      </aside>`;
    case 'terms':
      return html`<dl class="terms">${block.items.map((item) => html`<dt>${item.term}</dt><dd>${item.definition}</dd>`)}</dl>`;
    case 'figure':
      return renderFigure(block.name, block.caption);
    case 'widget':
      return renderWidget(block.name);
    default:
      return '';
  }
}

function mountLesson(root, { params, query, setTitle }, lesson) {
    const disposer = createDisposer();

    if (!lesson) {
      setTitle('Lesson not found', [{ label: 'Learn', href: '#/learn' }]);
      render(
        root,
        html`<div class="page">${emptyState({
          iconName: 'learn',
          title: "That lesson doesn't exist",
          text: 'It may have been renamed. Pick a lesson from the catalog instead.',
          actions: [{ label: 'Browse lessons', href: '#/learn', variant: 'primary' }],
        })}</div>`,
      );
      return () => disposer.dispose();
    }

    const category = catalog.getCategory(lesson.categoryId);
    setTitle(lesson.title, [{ label: 'Learn', href: '#/learn' }]);

    const steps = [...lesson.sections.map((section) => ({ kind: 'section', section })), { kind: 'quiz' }];
    const quizIndex = steps.length - 1;
    const passCount = Math.ceil(lesson.quiz.length * PASS_RATIO - 1e-9);

    const record = () => getState().learning.lessons[lesson.id];
    const resumeIndex = () => {
      const current = record();
      if (!current || current.completedAt) return 0;
      const firstOpen = lesson.sections.findIndex((section) => !current.sectionsDone.includes(section.id));
      return firstOpen === -1 ? quizIndex : firstOpen;
    };

    const requested = query.step === 'check' ? quizIndex : Number(query.step) - 1;
    let index = Number.isInteger(requested) && requested >= 0 && requested < steps.length ? requested : resumeIndex();
    let quiz = { answers: {}, checked: {}, grade: null, submitting: false, completedNow: false };
    let cleanupWidgets = null;
    let busy = false;

    render(
      root,
      html`<div class="page lesson">
        <header class="lesson-head" id="lesson-head"></header>
        <div class="lesson-layout">
          <aside class="lesson-aside" id="lesson-aside"></aside>
          <div class="lesson-main" id="lesson-main"></div>
        </div>
      </div>`,
    );

    const paintHead = () => {
      const progress = progressFor(lesson.id);
      render(
        $('#lesson-head', root),
        html`<div class="lesson-head__main">
            <a class="back-link" href="#/learn">${icon('arrow-left', { size: 16 })}All lessons</a>
            <p class="lesson-head__category">${icon(category?.icon || 'learn', { size: 14 })}${category?.title}</p>
            <h2 class="lesson-head__title">${lesson.title}</h2>
            <p class="lesson-head__summary">${lesson.summary}</p>
            <div class="lesson-head__meta">
              ${levelBadge(lesson.difficulty)}
              <span class="lesson-card__time">${icon('clock', { size: 14 })}${lesson.minutes} min</span>
              ${lessonStatus(progress.status)}
            </div>
            <div class="lesson-head__progress">${meter(progress.ratio, 'Lesson progress')}<span class="small muted">${progress.done} of ${progress.steps} steps done</span></div>
          </div>
          <div class="lesson-head__objectives">
            <p class="lesson-objectives__title">In this lesson you'll learn to</p>
            <ul class="lesson-objectives">${lesson.objectives.map((objective) => html`<li>${icon('check', { size: 14 })}<span>${objective}</span></li>`)}</ul>
          </div>`,
      );
    };

    const stepLabel = (step) => (step.kind === 'quiz' ? 'Knowledge check' : step.section.title);

    const paintAside = () => {
      const current = record();
      const done = new Set(current?.sectionsDone || []);
      render(
        $('#lesson-aside', root),
        html`<nav class="lesson-toc" aria-label="Lesson sections">
            <p class="lesson-toc__title">Sections</p>
            <ol class="toc-list">${steps.map((step, i) => {
              const isDone = step.kind === 'quiz' ? Boolean(current?.quizPassed) : done.has(step.section.id);
              return html`<li><button type="button" class="toc-item${isDone ? ' is-done' : ''}" data-step="${i}" ${i === index ? html`aria-current="step"` : ''}>
                <span class="toc-item__marker" aria-hidden="true">${isDone ? icon('check', { size: 12 }) : step.kind === 'quiz' ? icon('target', { size: 12 }) : i + 1}</span>
                <span class="toc-item__label">${stepLabel(step)}</span>
                ${isDone ? html`<span class="sr-only">, done</span>` : ''}
              </button></li>`;
            })}</ol>
          </nav>
          <div class="lesson-jump field">
            <label class="field__label" for="lesson-jump">Jump to a section</label>
            <div class="select-wrap"><select class="select" id="lesson-jump">${steps.map((step, i) => html`<option value="${i}" ${i === index ? 'selected' : ''}>${i + 1}. ${stepLabel(step)}</option>`)}</select></div>
          </div>
          ${lesson.tutorPrompts?.length
            ? html`<div class="lesson-ask">
                <p class="small muted">Stuck on something?</p>
                <a class="btn btn--secondary btn--sm btn--block" href="${href('/tutor', { ask: lesson.tutorPrompts[0], lesson: lesson.id })}">${icon('tutor')}Ask the tutor</a>
              </div>`
            : ''}`,
      );
    };

    const sectionStep = (step) => {
      const { section } = step;
      const last = index === quizIndex - 1;
      return html`<article class="lesson-step" aria-labelledby="step-title">
        <p class="lesson-step__count">Section ${index + 1} of ${lesson.sections.length}</p>
        <h3 class="lesson-step__title" id="step-title" tabindex="-1">${section.title}</h3>
        <div class="lesson-step__blocks">${section.blocks.map(renderBlock)}</div>
        <div class="lesson-nav">
          ${index > 0 ? html`<button type="button" class="btn btn--ghost" data-nav="prev">${icon('chevron-left')}Previous</button>` : html`<span></span>`}
          <button type="button" class="btn btn--primary" data-nav="continue">${last ? 'Continue to the knowledge check' : 'Continue'}${icon('chevron-right')}</button>
        </div>
      </article>`;
    };

    const quizStep = () => {
      const current = record();
      const allChecked = lesson.quiz.every((question) => quiz.checked[question.id]);
      return html`<article class="lesson-step quiz" aria-labelledby="step-title">
        <p class="lesson-step__count">Knowledge check</p>
        <h3 class="lesson-step__title" id="step-title" tabindex="-1">Check your understanding</h3>
        <p class="muted">Answer at least ${passCount} of ${lesson.quiz.length} questions correctly to complete the lesson.${
          current?.quizBest !== null && current?.quizBest !== undefined ? ` Your best score so far is ${current.quizBest} of ${lesson.quiz.length}.` : ''
        }</p>
        <ol class="quiz-list">${lesson.quiz.map((question, qIndex) => {
          const chosen = quiz.answers[question.id];
          const checked = quiz.checked[question.id];
          const correct = checked && chosen === question.correct;
          return html`<li class="quiz-q${checked ? (correct ? ' is-correct' : ' is-wrong') : ''}">
            <fieldset class="quiz-q__fieldset">
              <legend class="quiz-q__prompt"><span class="quiz-q__num" aria-hidden="true">${qIndex + 1}</span><span>${question.prompt}</span></legend>
              <div class="quiz-q__options">${question.options.map((option, oIndex) => {
                let state = '';
                if (checked && oIndex === question.correct) state = ' is-answer';
                else if (checked && oIndex === chosen) state = ' is-chosen-wrong';
                return html`<label class="quiz-opt${state}">
                  <input type="radio" name="quiz-${question.id}" value="${oIndex}" data-question="${question.id}" ${chosen === oIndex ? 'checked' : ''} ${checked ? 'disabled' : ''} />
                  <span class="quiz-opt__text">${option}</span>
                  ${state === ' is-answer' ? html`<span class="quiz-opt__mark">${icon('check-circle', { size: 16 })}<span class="sr-only">Correct answer</span></span>` : ''}
                  ${state === ' is-chosen-wrong' ? html`<span class="quiz-opt__mark">${icon('x-circle', { size: 16 })}<span class="sr-only">Your answer</span></span>` : ''}
                </label>`;
              })}</div>
            </fieldset>
            ${checked
              ? html`<div class="quiz-feedback" role="status">
                  <p class="quiz-feedback__verdict">${icon(correct ? 'check-circle' : 'info', { size: 16 })}${correct ? 'Correct.' : 'Not quite.'}</p>
                  <p class="quiz-feedback__text">${question.explanation}</p>
                </div>`
              : html`<div class="quiz-q__actions"><button type="button" class="btn btn--secondary btn--sm" data-check="${question.id}" ${chosen === undefined ? 'disabled' : ''}>Check answer</button>${chosen === undefined ? html`<span class="tiny faint">Choose an answer first</span>` : ''}</div>`}
          </li>`;
        })}</ol>
        <div id="quiz-result">${allChecked ? quizResult() : ''}</div>
        <div class="lesson-nav">
          <button type="button" class="btn btn--ghost" data-nav="prev">${icon('chevron-left')}Previous</button>
          <span></span>
        </div>
      </article>`;
    };

    const quizResult = () => {
      if (quiz.submitting || !quiz.grade) return html`<p class="muted" role="status">Saving your result…</p>`;
      const { score, total, passed } = quiz.grade;
      if (!passed) {
        return html`<section class="quiz-outcome quiz-outcome--retry" role="status" aria-labelledby="quiz-outcome-title">
          ${icon('reset', { className: 'quiz-outcome__icon' })}
          <div>
            <h4 class="quiz-outcome__title" id="quiz-outcome-title">${score} of ${total} correct. Not quite there yet.</h4>
            <p class="muted">Review the explanations above, revisit the sections if you need to, and try again. You need ${passCount} correct to complete the lesson.</p>
            <div class="cluster"><button type="button" class="btn btn--primary btn--sm" data-action="retry">Try the knowledge check again</button><button type="button" class="btn btn--secondary btn--sm" data-step="0">Review from the start</button></div>
          </div>
        </section>`;
      }
      const next = nextLesson(lesson.id);
      return html`<section class="quiz-outcome quiz-outcome--pass" role="status" aria-labelledby="quiz-outcome-title">
        ${icon('check-circle', { className: 'quiz-outcome__icon' })}
        <div>
          <h4 class="quiz-outcome__title" id="quiz-outcome-title">Lesson complete: ${score} of ${total} correct</h4>
          <p class="muted">${quiz.completedNow ? 'Your progress is saved.' : 'You had already completed this lesson; your best score is kept.'} Put it into practice with virtual money, or keep going.</p>
          <div class="cluster">
            ${next ? html`<a class="btn btn--primary btn--sm" href="#/learn/${next.id}">Next lesson: ${next.title}</a>` : html`<a class="btn btn--primary btn--sm" href="#/practice">Practice what you learned</a>`}
            <a class="btn btn--secondary btn--sm" href="#/learn">All lessons</a>
            <button type="button" class="btn btn--ghost btn--sm" data-action="retry">Retake the check</button>
          </div>
        </div>
      </section>`;
    };

    const syncUrl = () => {
      const target = `#/learn/${lesson.id}?step=${index === quizIndex ? 'check' : index + 1}`;
      try {
        if (window.location.hash !== target) window.history.replaceState(null, '', target);
      } catch {
        // History updates can be blocked in embedded viewers; the page still works.
      }
    };

    const paintMain = ({ focus = false } = {}) => {
      cleanupWidgets?.();
      const step = steps[index];
      const main = $('#lesson-main', root);
      render(main, step.kind === 'quiz' ? quizStep() : sectionStep(step));
      cleanupWidgets = mountWidgets(main);
      if (focus) {
        const title = $('#step-title', main);
        title?.focus({ preventScroll: true });
        const top = $('#lesson-head', root).getBoundingClientRect().bottom + window.scrollY - 80;
        if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
      }
    };

    const goTo = (nextIndex) => {
      index = Math.max(0, Math.min(quizIndex, nextIndex));
      syncUrl();
      paintAside();
      paintMain({ focus: true });
    };

    paintHead();
    paintAside();
    paintMain();
    syncUrl();
    disposer.add(() => cleanupWidgets?.());

    disposer.add(
      on(root, 'click', '[data-nav]', async (_event, button) => {
        if (button.dataset.nav === 'prev') {
          goTo(index - 1);
          return;
        }
        const step = steps[index];
        if (step.kind !== 'section' || busy) return;
        busy = true;
        button.disabled = true;
        try {
          await markSectionComplete(lesson.id, step.section.id);
          busy = false;
          goTo(index + 1);
          announce(`Section complete. Now on ${stepLabel(steps[index])}.`);
        } catch (error) {
          busy = false;
          button.disabled = false;
          toast({ title: 'Progress could not be saved', body: error.message, tone: 'error' });
        }
      }),
    );

    disposer.add(on(root, 'click', '[data-step]', (_event, button) => goTo(Number(button.dataset.step))));
    disposer.add(on(root, 'change', '#lesson-jump', (event) => goTo(Number(event.target.value))));

    disposer.add(
      on(root, 'change', 'input[data-question]', (event) => {
        quiz.answers[event.target.dataset.question] = Number(event.target.value);
        const question = event.target.dataset.question;
        const actions = event.target.closest('.quiz-q')?.querySelector('.quiz-q__actions');
        if (actions) {
          render(actions, html`<button type="button" class="btn btn--secondary btn--sm" data-check="${question}">Check answer</button>`);
        }
      }),
    );

    disposer.add(
      on(root, 'click', '[data-check]', async (_event, button) => {
        const id = button.dataset.check;
        if (quiz.answers[id] === undefined) return;
        quiz.checked[id] = true;
        const allChecked = lesson.quiz.every((question) => quiz.checked[question.id]);
        if (allChecked) quiz.submitting = true;
        paintMain();
        // Move focus to this question's feedback so it is read out, then the
        // learner can Tab on to the next question.
        const position = lesson.quiz.findIndex((question) => question.id === id);
        const feedback = root.querySelectorAll('.quiz-q')[position]?.querySelector('.quiz-feedback');
        if (feedback) {
          feedback.setAttribute('tabindex', '-1');
          feedback.focus({ preventScroll: true });
        }

        if (!allChecked) return;
        try {
          const local = gradeQuiz(lesson.quiz, quiz.answers);
          const result = await submitQuiz(lesson.id, quiz.answers, lesson);
          quiz.grade = result.grade || local;
          quiz.completedNow = result.completedNow;
          if (result.completedNow) {
            notify({ title: `Lesson completed: ${lesson.title}`, body: `${result.grade.score} of ${result.grade.total} correct on the knowledge check.`, kind: 'lesson', href: `#/learn/${lesson.id}` });
            toast({ title: 'Lesson complete', body: `${lesson.title}: ${plural(result.grade.score, 'correct answer')} out of ${result.grade.total}.`, tone: 'success' });
          }
        } catch (error) {
          quiz.grade = gradeQuiz(lesson.quiz, quiz.answers);
          toast({ title: 'Your result could not be saved', body: error.message, tone: 'error' });
        } finally {
          quiz.submitting = false;
          render($('#quiz-result', root), quizResult());
          $('#quiz-outcome-title', root)?.setAttribute('tabindex', '-1');
          $('#quiz-outcome-title', root)?.focus();
        }
      }),
    );

    disposer.add(
      on(root, 'click', '[data-action="retry"]', () => {
        quiz = { answers: {}, checked: {}, grade: null, submitting: false, completedNow: false };
        paintMain({ focus: true });
      }),
    );

    disposer.add(
      watch((state) => state.learning.lessons[lesson.id], () => {
        paintHead();
        paintAside();
      }),
    );

    return () => disposer.dispose();
}

export default {
  id: 'lesson',
  mount(root, ctx) {
    const metadata = catalog.getLesson(ctx.params.lessonId);
    if (!metadata) return mountLesson(root, ctx, null);

    ctx.setTitle(metadata.title, [{ label: 'Learn', href: '#/learn' }]);
    render(root, html`<div class="page"><section class="panel panel__body stack">
      <p class="muted" role="status">Checking course access…</p>
    </section></div>`);

    let cancelled = false;
    let innerCleanup = null;
    api.get(`/lessons/${encodeURIComponent(metadata.id)}`).then(
      ({ lesson }) => {
        if (!cancelled) innerCleanup = mountLesson(root, ctx, lesson);
      },
      (error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          ctx.setTitle('Course locked', [{ label: 'Learn', href: '#/learn' }]);
          render(root, html`<div class="page"><section class="panel panel__body stack">
            <span class="pill">Account required</span>
            <h2 class="panel__title">${metadata.title}</h2>
            <p role="status">This course requires an account. Sign up to unlock more learning content.</p>
            ${accountLinks(`/learn/${metadata.id}`)}
            <a class="link" href="#/learn">Back to all lessons</a>
          </section></div>`);
        } else if (error instanceof ApiError && error.status === 404) {
          innerCleanup = mountLesson(root, ctx, null);
        } else {
          ctx.setTitle('Course access unavailable', [{ label: 'Learn', href: '#/learn' }]);
          render(root, html`<div class="page"><section class="panel panel__body stack">
            <h2 class="panel__title">Couldn't verify course access</h2>
            <p role="alert">${error.message || 'Check your connection to the TradeLab server, then try again.'}</p>
            <a class="btn btn--secondary" href="#/learn">Back to lessons</a>
          </section></div>`);
        }
      },
    );
    return () => {
      cancelled = true;
      innerCleanup?.();
    };
  },
};
