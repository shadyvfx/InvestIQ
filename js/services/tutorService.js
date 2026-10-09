// TradeLab Tutor conversation.
//
// Preview mode (dataSource 'mock') answers from predefined explanations in
// data/mockTutorResponses.js. It is not a language model and the interface
// labels every reply that way.
//
// FLASK + llama.cpp: implement
//   POST /api/tutor/chat
//     { messages: [{ role: 'user'|'assistant', content }], context: { level, route, lessonId? } }
//     -> { reply: { content, source: 'llm', model } }
// The Flask route should build the account context server-side (it owns the
// ledger), add a system prompt, and forward the conversation to llama.cpp's
// OpenAI-compatible server (llama-server, POST /v1/chat/completions).
// See docs/integration.md for a sketch, a system prompt and a streaming plan.

import { config, isMock } from '../config.js';
import { api, localId } from './apiClient.js';
import { getState, setState, updateSlice, selectAccount, selectValuation, selectDayChange, LIMITS } from '../state.js';
import { buildMockReply } from '../data/mockTutorResponses.js';
import { dateOfDay } from './marketDataService.js';

export const MAX_MESSAGE_LENGTH = 1000;

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      },
      { once: true },
    );
  });
}

/** Account details the preview tutor uses for "my last trade" and "my portfolio". */
function accountContext(state) {
  const account = selectAccount(state);
  const valuation = selectValuation(state);
  const last = account.transactions.at(-1) || null;
  return {
    day: state.market.day,
    startingCash: account.startingCash,
    quotes: state.runtime.quotes,
    positions: valuation.positions,
    valuation,
    dayChange: selectDayChange(state),
    instrumentNames: Object.fromEntries(state.runtime.instruments.map((instrument) => [instrument.symbol, instrument.name])),
    lastTransaction: last ? { ...last, date: dateOfDay(last.day) } : null,
  };
}

const mock = {
  async reply({ messages, level, signal }) {
    const [min, max] = config.mockTutorDelayMs;
    await wait(min + Math.random() * (max - min), signal);
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const { content, topic } = buildMockReply({ text: lastUser?.content ?? '', context: accountContext(getState()), level });
    return { content, source: 'mock', topic };
  },
};

const remote = {
  async reply({ messages, level, pageContext, signal }) {
    const response = await api.post(
      '/tutor/chat',
      {
        messages: messages.slice(-12).map(({ role, content }) => ({ role, content })),
        context: { level, ...pageContext },
      },
      { signal, timeoutMs: config.tutorTimeoutMs },
    );
    return { content: response.reply.content, source: response.reply.source || 'llm', model: response.reply.model };
  },
};

const adapter = isMock() ? mock : remote;

let controller = null;

function setPending(pending) {
  setState((state) => ({ ...state, runtime: { ...state.runtime, tutorPending: pending } }), 'tutor/pending');
}

function appendMessage(message) {
  updateSlice(
    'tutor',
    (tutor) => ({ ...tutor, messages: [...tutor.messages, message].slice(-LIMITS.MAX_TUTOR_MESSAGES) }),
    'tutor/message',
  );
}

export function isPreviewMode() {
  return isMock();
}

/**
 * Sends a learner message and appends the tutor's reply.
 * `pageContext` ({ route, lessonId? }) is forwarded to the backend in api mode.
 */
export async function sendMessage(text, pageContext = {}) {
  const content = String(text ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!content || getState().runtime.tutorPending) return null;

  appendMessage({ id: localId('msg'), role: 'user', content, createdAt: Date.now() });
  setPending(true);
  controller = new AbortController();

  try {
    const reply = await adapter.reply({
      messages: getState().tutor.messages,
      level: getState().preferences.difficulty,
      pageContext,
      signal: controller.signal,
    });
    const message = {
      id: localId('msg'),
      role: 'assistant',
      content: reply.content,
      createdAt: Date.now(),
      meta: { source: reply.source, topic: reply.topic ?? null, model: reply.model ?? null },
    };
    appendMessage(message);
    return message;
  } catch (error) {
    if (error?.name === 'AbortError') return null;
    const message = {
      id: localId('msg'),
      role: 'assistant',
      content: error?.message || 'The tutor could not answer just now. Try again in a moment.',
      createdAt: Date.now(),
      meta: { source: 'error' },
    };
    appendMessage(message);
    return message;
  } finally {
    controller = null;
    setPending(false);
  }
}

/** Stops waiting for a reply (used when clearing the conversation). */
export function cancelPending() {
  controller?.abort();
}

export function clearConversation() {
  cancelPending();
  updateSlice('tutor', (tutor) => ({ ...tutor, messages: [] }), 'tutor/cleared');
}
