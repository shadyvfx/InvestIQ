import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  dispatchEvent: () => true,
  TRADELAB_CONFIG: {
    dataSource: 'mock',
    tutorApiEnabled: true,
  },
};
globalThis.location = { href: 'http://127.0.0.1:5000/' };

const requests = [];
let nextReply = { content: 'A candle summarizes price movement.', source: 'llm', model: 'Qwen3-8B Q4_K_M' };
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  const reply = nextReply;
  const metadata = JSON.stringify({ source: reply.source, model: reply.model });
  const stream = [
    `event: meta\ndata: ${metadata}\n\n`,
    `event: token\ndata: ${JSON.stringify({ content: reply.content })}\n\n`,
    `event: done\ndata: ${metadata}\n\n`,
  ].join('');
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

const { config, isMock } = await import('../js/config.js');
const { initMarket } = await import('../js/services/marketDataService.js');
const { cancelPending, sendMessage } = await import('../js/services/tutorService.js');
const { getState, initStore } = await import('../js/state.js');

test('the local tutor uses Flask while market features stay in mock mode', async () => {
  assert.equal(config.dataSource, 'mock');
  assert.equal(config.tutorApiEnabled, true);
  assert.equal(isMock(), true);

  initStore();
  await initMarket();
  assert.equal(getState().runtime.marketStatus, 'ready');
  assert.equal(requests.length, 0);

  const receivedChunks = [];
  const reply = await sendMessage('Explain candlestick charts to me.', { route: 'tutor' }, (chunk) => receivedChunks.push(chunk));

  assert.equal(reply.meta.source, 'llm');
  assert.equal(reply.meta.model, 'Qwen3-8B Q4_K_M');
  assert.equal(reply.meta.streamed, true);
  assert.deepEqual(receivedChunks, ['A candle summarizes price movement.']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:5000/api/tutor/chat');
  assert.equal(requests[0].options.credentials, 'same-origin');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.stream, true);
  assert.deepEqual(body.context, { level: 'beginner', route: 'tutor' });
  assert.deepEqual(body.messages.map(({ role }) => role), ['user']);

  const followUp = await sendMessage('Why?', { route: 'tutor' });
  assert.equal(followUp.content, nextReply.content);
  const followUpBody = JSON.parse(requests[1].options.body);
  assert.deepEqual(followUpBody.messages.map(({ role }) => role), ['user', 'assistant', 'user']);
  assert.deepEqual(
    followUpBody.messages.map(({ content }) => content),
    ['Explain candlestick charts to me.', 'A candle summarizes price movement.', 'Why?'],
  );

  const { SUGGESTED_QUESTIONS } = await import('../js/data/mockTutorResponses.js');
  nextReply = {
    content: "I couldn't find a relevant, indexed source.",
    source: 'knowledge_base',
    model: null,
  };
  for (const question of SUGGESTED_QUESTIONS) {
    const cannedReply = await sendMessage(question, { route: 'tutor' });
    assert.equal(cannedReply.meta.source, 'mock', question);
    assert.ok(cannedReply.content.length > 0, question);
    assert.notEqual(cannedReply.meta.topic, 'fallback', question);
  }
  assert.equal(requests.length, SUGGESTED_QUESTIONS.length + 2);
});

test('stopping a streamed tutor reply retains only the received partial answer', async () => {
  const encoder = new TextEncoder();
  globalThis.fetch = async (_url, { signal }) => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: meta\ndata: {"source":"llm","model":"local"}\n\n' +
          'event: token\ndata: {"content":"Partial answer"}\n\n',
        ));
        signal.addEventListener('abort', () => {
          controller.error(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        }, { once: true });
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
  initStore();

  const pendingReply = sendMessage('Explain diversification.');
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancelPending();
  const reply = await pendingReply;

  assert.equal(reply.content, 'Partial answer');
  assert.equal(reply.meta.interrupted, true);
  assert.equal(reply.meta.stopped, true);
});

test('output-token limit keeps the partial streamed answer with an interrupted marker', async () => {
  globalThis.fetch = async () => new Response(
    [
      'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
      'event: token\ndata: {"content":"| Limit Order | $"}\n\n',
      'event: error\ndata: {"code":"tutor_output_limit","message":"Length limit","finish_reason":"length","max_tokens":900}\n\n',
    ].join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
  initStore();

  const reply = await sendMessage('Explain limit orders with a table.');

  assert.equal(reply.content, 'Length limit');
  assert.equal(reply.meta.source, 'error');
  assert.equal(getState().tutor.messages.at(-1).content, 'Length limit');
  assert.equal(getState().tutor.messages.at(-2).content, '| Limit Order | $');
  assert.equal(getState().tutor.messages.at(-2).meta.interrupted, true);
  assert.equal(getState().tutor.messages.at(-2).meta.stopped, false);
  assert.equal(getState().tutor.messages.at(-2).meta.reason, 'tutor_output_limit');
  assert.equal(getState().tutor.messages.at(-2).meta.details.finish_reason, 'length');
});
