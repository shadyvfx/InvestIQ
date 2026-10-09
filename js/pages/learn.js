// Learn: the course catalog grouped by topic, with filters and progress.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch } from '../state.js';
import { icon } from '../components/icons.js';
import { levelBadge, lessonStatus, meter, emptyState } from '../components/ui.js';
import { catalog, overall, progressFor, suggestions } from '../services/progressService.js';
import { DIFFICULTY_LEVELS, DIFFICULTY_LABELS } from '../core/progress.js';
import { plural } from '../utils/format.js';

const filters = { category: 'all', level: 'all', status: 'all' };

function lessonRow(lesson, state) {
  const progress = progressFor(lesson.id, state);
  const pct = Math.round(progress.ratio * 100);
  const order = catalog.lessons.indexOf(lesson) + 1;
  const done = progress.status === 'completed';
  return html`<li class="syllabus__row${done ? ' is-done' : ''}">
    <span class="syllabus__num" aria-hidden="true">${done ? icon('check', { size: 14 }) : order}</span>
    <div class="syllabus__main">
      <h3 class="syllabus__title"><a class="syllabus__link" href="#/learn/${lesson.id}" aria-describedby="lesson-${lesson.id}-meta">${lesson.title}</a></h3>
      <p class="syllabus__summary">${lesson.summary}</p>
    </div>
    <div class="syllabus__meta" id="lesson-${lesson.id}-meta">
      ${levelBadge(lesson.difficulty)}
      <span class="lesson-card__time">${icon('clock', { size: 14 })}${lesson.minutes} min</span>
      <span class="syllabus__status">${lessonStatus(progress.status)}</span>
    </div>
    <div class="syllabus__progress">${meter(progress.ratio, `${lesson.title} progress`)}<span class="tiny faint num">${pct}%</span></div>
  </li>`;
}

function matches(lesson, state) {
  if (filters.category !== 'all' && lesson.categoryId !== filters.category) return false;
  if (filters.level !== 'all' && lesson.difficulty !== filters.level) return false;
  if (filters.status !== 'all' && progressFor(lesson.id, state).status !== filters.status) return false;
  return true;
}

function filterBar() {
  const counts = Object.fromEntries(catalog.categories.map((category) => [category.id, catalog.lessons.filter((l) => l.categoryId === category.id).length]));
  return html`<div class="learn-filters">
    <div class="chip-list" role="group" aria-label="Filter by topic">
      <button type="button" class="chip" data-category="all" aria-pressed="${filters.category === 'all'}">All topics <span class="chip__count">${catalog.lessons.length}</span></button>
      ${catalog.categories.map(
        (category) => html`<button type="button" class="chip" data-category="${category.id}" aria-pressed="${filters.category === category.id}">${category.title} <span class="chip__count">${counts[category.id]}</span></button>`,
      )}
    </div>
    <div class="learn-filters__selects">
      <div class="field field--inline learn-filters__topic">
        <label class="field__label" for="learn-topic">Topic</label>
        <div class="select-wrap"><select class="select" id="learn-topic">
          <option value="all" ${filters.category === 'all' ? 'selected' : ''}>All topics</option>
          ${catalog.categories.map((category) => html`<option value="${category.id}" ${filters.category === category.id ? 'selected' : ''}>${category.title}</option>`)}
        </select></div>
      </div>
      <div class="field field--inline">
        <label class="field__label" for="learn-level">Difficulty</label>
        <div class="select-wrap"><select class="select" id="learn-level">
          <option value="all" ${filters.level === 'all' ? 'selected' : ''}>All levels</option>
          ${DIFFICULTY_LEVELS.map((level) => html`<option value="${level}" ${filters.level === level ? 'selected' : ''}>${DIFFICULTY_LABELS[level]}</option>`)}
        </select></div>
      </div>
      <div class="field field--inline">
        <label class="field__label" for="learn-status">Status</label>
        <div class="select-wrap"><select class="select" id="learn-status">
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Any status</option>
          <option value="not-started" ${filters.status === 'not-started' ? 'selected' : ''}>Not started</option>
          <option value="in-progress" ${filters.status === 'in-progress' ? 'selected' : ''}>In progress</option>
          <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
        </select></div>
      </div>
    </div>
  </div>`;
}

function summary(state) {
  const totals = overall(state);
  const [next] = suggestions(1, state);
  return html`<section class="learn-summary panel" aria-label="Your learning progress">
    <div class="learn-summary__progress">
      <p class="stat__label">Course progress</p>
      <p class="stat__value figure">${totals.completed} <span class="stat__unit">of ${totals.total} lessons complete</span></p>
      ${meter(totals.ratio, 'Overall course progress')}
      <p class="stat__sub">${totals.inProgress ? `${plural(totals.inProgress, 'lesson')} in progress. ` : ''}Pass a lesson's knowledge check to complete it.</p>
    </div>
    ${next
      ? html`<div class="learn-summary__next">
          <p class="stat__label">${next.progress.status === 'in-progress' ? 'Continue where you left off' : 'Suggested next'}</p>
          <p class="learn-summary__title">${next.lesson.title}</p>
          <p class="small muted">${catalog.getCategory(next.lesson.categoryId)?.title}, ${next.lesson.minutes} min</p>
          <a class="btn btn--primary btn--sm" href="#/learn/${next.lesson.id}">${next.progress.status === 'in-progress' ? 'Continue lesson' : 'Start lesson'}</a>
        </div>`
      : html`<div class="learn-summary__next"><p class="stat__label">All done</p><p class="learn-summary__title">You've completed every lesson.</p><a class="btn btn--secondary btn--sm" href="#/practice">Practice what you learned</a></div>`}
  </section>`;
}

function lessonList(state) {
  const visible = catalog.lessons.filter((lesson) => matches(lesson, state));
  if (!visible.length) {
    return emptyState({
      iconName: 'search',
      title: 'No lessons match these filters',
      text: 'Try another topic, difficulty or status.',
      actions: [{ label: 'Clear filters', action: 'clear-filters' }],
    });
  }
  const groups = catalog.categories
    .map((category) => ({ category, lessons: visible.filter((lesson) => lesson.categoryId === category.id) }))
    .filter((group) => group.lessons.length);
  return html`${groups.map(({ category, lessons }) => {
    const completed = lessons.filter((lesson) => progressFor(lesson.id, state).status === 'completed').length;
    return html`<section class="panel syllabus" aria-labelledby="group-${category.id}">
      <div class="panel__head">
        <div class="syllabus__head">
          <h2 class="panel__title syllabus__heading" id="group-${category.id}">${icon(category.icon, { size: 18 })}${category.title}</h2>
          <p class="panel__subtitle">${category.description}</p>
        </div>
        <span class="small muted">${completed} of ${plural(lessons.length, 'lesson')} complete</span>
      </div>
      <ul class="syllabus__list">${lessons.map((lesson) => lessonRow(lesson, state))}</ul>
    </section>`;
  })}`;
}

export default {
  id: 'learn',
  mount(root, { query }) {
    const disposer = createDisposer();
    if (query.category && catalog.getCategory(query.category)) filters.category = query.category;

    render(
      root,
      html`<div class="page learn">
        <div id="learn-summary"></div>
        <div id="learn-filters"></div>
        <div id="learn-list" class="stack"></div>
      </div>`,
    );

    const paintSummary = () => render($('#learn-summary', root), summary(getState()));
    const paintFilters = () => render($('#learn-filters', root), filterBar());
    const paintList = () => render($('#learn-list', root), lessonList(getState()));

    paintSummary();
    paintFilters();
    paintList();

    disposer.add(
      on(root, 'click', '[data-category]', (_event, button) => {
        filters.category = button.dataset.category;
        for (const chip of root.querySelectorAll('[data-category]')) chip.setAttribute('aria-pressed', String(chip === button));
        const topic = root.querySelector('#learn-topic');
        if (topic) topic.value = filters.category;
        paintList();
      }),
    );
    disposer.add(
      on(root, 'change', '#learn-level, #learn-status, #learn-topic', (event) => {
        if (event.target.id === 'learn-level') filters.level = event.target.value;
        else if (event.target.id === 'learn-topic') {
          filters.category = event.target.value;
          for (const chip of root.querySelectorAll('[data-category]')) chip.setAttribute('aria-pressed', String(chip.dataset.category === filters.category));
        } else filters.status = event.target.value;
        paintList();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-action="clear-filters"]', () => {
        filters.category = 'all';
        filters.level = 'all';
        filters.status = 'all';
        paintFilters();
        paintList();
        root.querySelector('[data-category="all"]')?.focus();
      }),
    );
    disposer.add(
      watch((state) => state.learning, () => {
        paintSummary();
        paintList();
      }),
    );
    disposer.add(watch((state) => state.preferences.difficulty, paintSummary));

    return () => disposer.dispose();
  },
};
