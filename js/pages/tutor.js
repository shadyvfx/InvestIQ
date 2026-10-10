// AI Tutor: a conversation with TradeLab's AI tutor.
// Preview replies use local explanations; live replies stream through tutorService.

import { html, raw, render, on, createDisposer, toElement, $ } from '../utils/dom.js';
import { getState, watch } from '../state.js';
import { markdownToHTML } from '../utils/markdown.js';
import { createAssistantResponseRenderer } from '../utils/assistantResponseRenderer.js';
import { clockTime } from '../utils/format.js';
import { icon, logoMark } from '../components/icons.js';
import { confirmDialog } from '../components/modals.js';
import { sendMessage, clearConversation, cancelPending, isPreviewMode, MAX_MESSAGE_LENGTH } from '../services/tutorService.js';
import { catalog } from '../services/progressService.js';
import { SUGGESTED_QUESTIONS } from '../data/mockTutorResponses.js';

function avatar() {
  return html`<span class="msg__avatar" aria-hidden="true">${logoMark({ className: 'msg__mark' })}</span>`;
}

function message(msg, visibleContent = msg.content) {
  if (msg.role === 'user') {
    return html`<div class="msg msg--user">
      <div class="msg__bubble"><p class="msg__text">${msg.content}</p></div>
      <p class="msg__meta"><span class="sr-only">You said, </span>${clockTime(msg.createdAt)}</p>
    </div>`;
  }
  return html`<div class="msg msg--assistant ${msg.meta?.source === 'error' ? 'msg--error' : ''}">${avatar()}
    <div class="msg__body">
      <p class="msg__meta"><span class="msg__name">TradeLab Tutor</span><span>${clockTime(msg.createdAt)}</span></p>
      ${msg.meta?.source === 'error'
        ? html`<div class="callout callout--warn">${icon('alert', { className: 'callout__icon' })}<div class="msg__content">${raw(markdownToHTML(visibleContent))}</div></div>`
        : html`<div class="prose prose--sm msg__content">${raw(markdownToHTML(visibleContent))}</div>`}
      ${msg.meta?.interrupted ? html`<p class="small muted" role="status">${msg.meta.stopped ? 'Generation stopped.' : 'Response interrupted.'}</p>` : ''}
    </div>
  </div>`;
}

function intro() {
  return html`<div class="msg msg--assistant msg--intro">${avatar()}
    <div class="msg__body">
      <p class="msg__meta"><span class="msg__name">TradeLab Tutor</span>${isPreviewMode() ? html`<span class="pill">Preview mode</span>` : ''}</p>
      <div class="prose prose--sm">
        <p>Hi! I'm TradeLab's AI tutor. I explain financial and stock-market concepts in plain language.</p>
        ${isPreviewMode()
          ? html`<p>Local AI mode is off. I answer from prewritten explanations on beginner topics rather than a language model, so I can't handle every question.</p>`
          : ''}
        <p>Pick a question below or type your own.</p>
      </div>
    </div>
  </div>`;
}

function pending(streaming = false) {
  return html`<div class="msg msg--assistant msg--pending">${avatar()}
    <div class="msg__body">
      <p class="msg__meta"><span class="msg__name">TradeLab Tutor</span></p>
      ${streaming
        ? html`<div class="prose prose--sm msg__content"></div>`
        : ''}
      <p class="msg__typing" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>${streaming ? 'Generating response…' : 'Thinking…'}</p>
    </div>
  </div>`;
}

function suggestionChips(disabled) {
  return SUGGESTED_QUESTIONS.map(
    (question) => html`<button type="button" class="chip" data-ask="${question}" ${disabled ? 'disabled' : ''}>${question}</button>`,
  );
}

export default {
  id: 'tutor',
  mount(root, { query }) {
    const disposer = createDisposer();
    render(
      root,
      html`<div class="page tutor">
        <div class="tutor-layout">
          <section class="panel chat" aria-labelledby="chat-title">
            <div class="panel__head chat__head">
              <div class="cluster">
                <h2 class="panel__title" id="chat-title">TradeLab Tutor</h2>
              </div>
              <button type="button" class="btn btn--ghost btn--sm" data-action="clear">${icon('trash')}Clear conversation</button>
            </div>
            <div class="chat__log" id="chat-log" role="log" aria-label="Conversation with TradeLab Tutor" tabindex="0"></div>
            <form class="chat__composer" id="chat-form" novalidate>
              <div class="chat__suggestions" id="chat-suggestions" role="group" aria-label="Suggested questions"></div>
              <div class="chat__inputrow">
                <label class="sr-only" for="chat-input">Message TradeLab Tutor</label>
                <textarea class="textarea chat__input" id="chat-input" rows="1" maxlength="${MAX_MESSAGE_LENGTH}" placeholder="${isPreviewMode() ? 'Ask about a concept or your simulated trades' : 'Ask about a financial or stock-market concept'}" aria-describedby="chat-hint"></textarea>
                <button type="submit" class="btn btn--primary chat__send" id="chat-send" aria-label="Send message">${icon('send')}<span class="chat__send-label">Send</span></button>
              </div>
              <p class="chat__hint" id="chat-hint"><span>Enter to send, Shift+Enter for a new line.</span><span>Educational explanations, not financial advice.</span><span class="chat__count" id="chat-count"></span></p>
            </form>
          </section>
          <aside class="tutor-side stack">
            <section class="panel" aria-labelledby="about-tutor">
              <div class="panel__head panel__head--plain"><h2 class="panel__title" id="about-tutor">About this tutor</h2></div>
              <div class="panel__body stack-sm small muted">
                ${isPreviewMode()
                  ? html`<p>This is a <strong>preview</strong>. Replies come from prewritten explanations matched to your question by topic. Nothing is sent to an AI service.</p>
                      <p>Enable <code>tutorApiEnabled</code> in <code>js/config.js</code> to use the locally hosted Qwen model through Flask.</p>`
                  : html`<p>Replies are generated by TradeLab's AI tutor using Qwen running locally through Flask. Your simulated account data is not sent with tutor requests.</p>`}
                <p>The tutor explains concepts; it never tells you what to buy or sell.</p>
              </div>
            </section>
            <section class="panel" aria-labelledby="topics-title">
              <div class="panel__head panel__head--plain"><h2 class="panel__title" id="topics-title">Topics it covers</h2></div>
              <div class="panel__body">
                <ul class="topic-list small">
                  <li><a class="link" href="#/learn/candlestick-anatomy">Candlestick charts</a></li>
                  <li><a class="link" href="#/learn/market-vs-limit-orders">Market and limit orders</a></li>
                  <li><a class="link" href="#/learn/position-sizing">Risk-to-reward and position sizing</a></li>
                  <li><a class="link" href="#/learn/diversification-basics">Diversification and index funds</a></li>
                  <li><a class="link" href="#/learn/moving-averages">Moving averages and RSI</a></li>
                  <li><a class="link" href="#/learn/trading-psychology">Trading psychology</a></li>
                  ${isPreviewMode() ? html`<li>Your last simulated trade and your portfolio</li>` : html`<li>Paper trading and portfolio concepts</li>`}
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </div>`,
    );

    const log = $('#chat-log', root);
    const input = $('#chat-input', root);
    const send = $('#chat-send', root);
    const count = $('#chat-count', root);
    let renderedIds = [];
    const responseRenderers = new Set();
    let shouldFollowBottom = true;
    let activeStream = null;

    const responseRenderer = (target) => {
      const renderer = createAssistantResponseRenderer(target, {
        reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        onUpdate: () => {
          if (shouldFollowBottom) log.scrollTop = log.scrollHeight;
        },
      });
      responseRenderers.add(renderer);
      return renderer;
    };
    disposer.add(() => {
      for (const renderer of responseRenderers) renderer.dispose();
      responseRenderers.clear();
    });

    // Sent with every message so a backend model knows where the learner is.
    // Opening the tutor from a lesson (#/tutor?ask=..&lesson=<id>) adds the lesson.
    const pageContext = { route: 'tutor', ...(query.lesson && catalog.getLesson(query.lesson) ? { lessonId: query.lesson } : {}) };

    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;

    const appendStreamChunk = (chunk) => {
      if (!activeStream) {
        const pendingContainer = log.querySelector('.chat__pending');
        render(pendingContainer, pending(true));
        const target = pendingContainer.querySelector('.msg__content');
        activeStream = {
          renderer: responseRenderer(target),
          content: '',
        };
      }
      activeStream.content += chunk;
      activeStream.renderer.append(chunk);
    };

    // Messages are appended rather than re-rendered, so screen readers only
    // announce what is new in the conversation log.
    const paintLog = ({ forceScroll = false } = {}) => {
      const { messages } = getState().tutor;
      const stick = forceScroll || shouldFollowBottom || nearBottom();
      const sameStart = renderedIds.length <= messages.length && renderedIds.every((id, i) => messages[i]?.id === id);
      if (!sameStart || renderedIds.length === 0) {
        const animateNewMessages = renderedIds.length > 0;
        render(
          log,
          html`${intro()}<div class="chat__messages">${messages.map((msg) => {
            const shouldAnimate = animateNewMessages && !renderedIds.includes(msg.id) && msg.role === 'assistant' && !msg.meta?.streamed;
            return message(msg, shouldAnimate ? '' : msg.content);
          })}</div><div class="chat__pending" aria-hidden="true"></div>`,
        );
        if (animateNewMessages) {
          const list = log.querySelector('.chat__messages');
          messages.forEach((msg, index) => {
            const shouldAnimate = !renderedIds.includes(msg.id) && msg.role === 'assistant' && !msg.meta?.streamed;
            const target = list.children[index]?.querySelector('.msg__content');
            if (shouldAnimate && target) responseRenderer(target).reveal(msg.content);
          });
        }
      } else {
        const list = log.querySelector('.chat__messages');
        for (const msg of messages.slice(renderedIds.length)) {
          if (msg.role === 'assistant' && msg.meta?.streamed && activeStream) {
            activeStream = null;
            render(log.querySelector('.chat__pending'), '');
            list.appendChild(toElement(message(msg)));
          } else if (msg.role === 'assistant') {
            const node = toElement(message(msg, ''));
            list.appendChild(node);
            responseRenderer(node.querySelector('.msg__content')).reveal(msg.content);
          } else {
            list.appendChild(toElement(message(msg)));
          }
        }
      }
      renderedIds = messages.map((msg) => msg.id);
      if (!getState().runtime.tutorPending) activeStream = null;
      if (!activeStream) render(log.querySelector('.chat__pending'), getState().runtime.tutorPending ? pending() : '');
      if (stick) log.scrollTop = log.scrollHeight;
      shouldFollowBottom = nearBottom();
    };

    const paintComposer = () => {
      const isPending = getState().runtime.tutorPending;
      const empty = getState().tutor.messages.length === 0;
      render($('#chat-suggestions', root), html`${suggestionChips(isPending)}`);
      $('#chat-suggestions', root).classList.toggle('chat__suggestions--compact', !empty);
      send.disabled = !isPending && input.value.trim() === '';
      send.type = isPending ? 'button' : 'submit';
      if (isPending) {
        send.dataset.action = 'stop';
        send.setAttribute('aria-label', 'Stop response generation');
      } else {
        delete send.dataset.action;
        send.setAttribute('aria-label', 'Send message');
      }
      send.querySelector('.chat__send-label').textContent = isPending ? 'Stop' : 'Send';
      const sendIcon = send.querySelector('svg');
      if (sendIcon) sendIcon.hidden = isPending;
      const remaining = MAX_MESSAGE_LENGTH - input.value.length;
      count.textContent = remaining < 200 ? `${remaining} characters left` : '';
    };

    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    };

    const ask = async (text) => {
      const value = String(text ?? '').trim();
      if (!value || getState().runtime.tutorPending) return;
      input.value = '';
      autosize();
      paintComposer();
      shouldFollowBottom = true;
      log.scrollTop = log.scrollHeight;
      activeStream = null;
      await sendMessage(value, pageContext, appendStreamChunk);
    };

    paintLog({ forceScroll: true });
    paintComposer();

    disposer.add(
      on(root, 'submit', '#chat-form', (event) => {
        event.preventDefault();
        ask(input.value);
      }),
    );
    disposer.add(
      on(root, 'keydown', '#chat-input', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          ask(input.value);
        }
      }),
    );
    disposer.add(
      on(root, 'input', '#chat-input', () => {
        autosize();
        paintComposer();
      }),
    );
    disposer.add(on(root, 'click', '[data-ask]', (_event, button) => ask(button.dataset.ask)));
    disposer.add(on(root, 'click', '[data-action="stop"]', () => cancelPending()));
    const trackScrollPosition = () => {
      shouldFollowBottom = nearBottom();
    };
    log.addEventListener('scroll', trackScrollPosition, { passive: true });
    disposer.add(() => log.removeEventListener('scroll', trackScrollPosition));
    disposer.add(
      on(root, 'click', '[data-action="clear"]', async () => {
        if (!getState().tutor.messages.length) {
          input.focus();
          return;
        }
        const confirmed = await confirmDialog({
          title: 'Clear the conversation?',
          message: 'All messages in this conversation will be removed from this browser.',
          confirmLabel: 'Clear conversation',
          danger: true,
        });
        if (confirmed) {
          clearConversation();
          input.focus();
        }
      }),
    );

    disposer.add(
      watch((state) => state.tutor.messages, () => {
        paintLog();
        paintComposer();
      }),
    );
    disposer.add(
      watch((state) => state.runtime.tutorPending, () => {
        paintLog();
        paintComposer();
        if (!getState().runtime.tutorPending && root.contains(document.activeElement) === false) input.focus({ preventScroll: true });
      }),
    );

    // Deep link from elsewhere in the app: #/tutor?ask=<question>
    if (query.ask) {
      const question = String(query.ask).slice(0, MAX_MESSAGE_LENGTH);
      try {
        window.history.replaceState(null, '', '#/tutor');
      } catch {
        // Ignored in viewers that block history updates.
      }
      queueMicrotask(() => ask(question));
    } else {
      input.focus({ preventScroll: true });
    }

    return () => disposer.dispose();
  },
};
