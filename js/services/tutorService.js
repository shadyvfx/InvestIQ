// TradeLab Tutor conversation.
//
// Preview mode (tutorApiEnabled false) answers from predefined explanations
// in data/mockTutorResponses.js. It is not a language model and the interface
// labels every reply that way.
//
// When tutorApiEnabled is true, Flask adds the system prompt and forwards this
// conversation to the local llama.cpp OpenAI-compatible endpoint.

import { config } from '../config.js';
import { localId, postStream } from './apiClient.js';
import { getState, setState, updateSlice, selectAccount, selectValuation, selectDayChange, LIMITS } from '../state.js';
import { buildMockReply, matchTopic } from '../data/mockTutorResponses.js';
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
  async reply({ messages, level, pageContext, signal, onChunk = () => {} }) {
    let source = null;
    let visibleStreamed = false;
    const response = await postStream(
      '/tutor/chat',
      {
        messages: messages.slice(-12).map(({ role, content }) => ({ role, content })),
        context: { level, ...pageContext },
        stream: true,
      },
      {
        signal,
        timeoutMs: config.tutorTimeoutMs,
        onMeta: (metadata) => {
          source = metadata.source;
        },
        onChunk: (chunk) => {
          if (source !== 'knowledge_base') {
            visibleStreamed = true;
            onChunk(chunk);
          }
        },
      },
    );
    if (response.reply.source === 'knowledge_base') {
      const lastUser = [...messages].reverse().find((message) => message.role === 'user');
      const topic = matchTopic(lastUser?.content ?? '');
      if (topic) {
        const canned = buildMockReply({
          text: lastUser.content,
          context: accountContext(getState()),
          level,
        });
        return { content: canned.content, source: 'mock', topic: canned.topic };
      }
    }
    return {
      content: response.reply.content,
      source: response.reply.source || 'llm',
      model: response.reply.model,
      streamed: response.streamed && visibleStreamed,
    };
  },
};

const adapter = config.tutorApiEnabled ? remote : mock;

let controller = null;
let discardPendingReply = false;

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
  return !config.tutorApiEnabled;
}

/**
 * Sends a learner message and appends the tutor's reply.
 * `pageContext` ({ route, lessonId? }) is forwarded to the backend when enabled.
 */
export async function sendMessage(text, pageContext = {}, onChunk = () => {}) {
  if (getState().runtime.userStatus !== 'signed-in') {
    throw new Error("You'll need to sign in to access TraderLab Tutor.");
  }
  const content = String(text ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!content || getState().runtime.tutorPending) return null;

  appendMessage({ id: localId('msg'), role: 'user', content, createdAt: Date.now() });
  setPending(true);
  controller = new AbortController();
  discardPendingReply = false;
  let streamedContent = '';

  try {
    const reply = await adapter.reply({
      messages: getState().tutor.messages,
      level: getState().preferences.difficulty,
      pageContext,
      signal: controller.signal,
      onChunk: (chunk) => {
        streamedContent += chunk;
        onChunk(chunk);
      },
    });
    const message = {
      id: localId('msg'),
      role: 'assistant',
      content: reply.content,
      createdAt: Date.now(),
      meta: {
        source: reply.source,
        topic: reply.topic ?? null,
        model: reply.model ?? null,
        streamed: reply.streamed ?? false,
      },
    };
    appendMessage(message);
    return message;
  } catch (error) {
    if (discardPendingReply) return null;
    if (streamedContent) {
      const partial = {
        id: localId('msg'),
        role: 'assistant',
        content: streamedContent,
        createdAt: Date.now(),
        meta: {
          source: 'llm',
          streamed: true,
          interrupted: true,
          stopped: error?.name === 'AbortError',
          reason: error?.code || null,
          details: error?.details || null,
        },
      };
      appendMessage(partial);
      if (error?.name === 'AbortError') return partial;
    } else if (error?.name === 'AbortError') {
      return null;
    }
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
    discardPendingReply = false;
    setPending(false);
  }
}

/** Stops waiting for a reply (used when clearing the conversation). */
export function cancelPending(discardReply = false) {
  discardPendingReply = discardReply;
  controller?.abort();
}

export function clearConversation() {
  cancelPending(true);
  updateSlice('tutor', (tutor) => ({ ...tutor, messages: [] }), 'tutor/cleared');
}
