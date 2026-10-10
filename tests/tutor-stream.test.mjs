import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  TRADELAB_CONFIG: {
    apiBaseUrl: '/api',
    apiTimeoutMs: 5000,
  },
};
globalThis.location = { href: 'http://127.0.0.1:5000/' };

const { postStream, ApiError } = await import('../js/services/apiClient.js');
const { markdownToHTML } = await import('../js/utils/markdown.js');
const { createAssistantResponseRenderer } = await import('../js/utils/assistantResponseRenderer.js');

function eventStream(events, chunkSize = Infinity) {
  const text = events.join('');
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
  );
}

test('postStream parses split SSE frames and delivers each Markdown chunk once', async () => {
  const events = [
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    'event: token\ndata: {"content":"# Risk\\n"}\n\n',
    'event: token\ndata: {"content":"- Diversify"}\n\n',
    'event: token\ndata: {"content":" across assets.\\n"}\n\n',
    'event: done\ndata: {"source":"llm","model":"local"}\n\n',
  ];
  const received = [];
  let metadata;
  globalThis.fetch = async () => eventStream(events, 7);

  const result = await postStream('/tutor/chat', { stream: true }, {
    onChunk: (chunk) => received.push(chunk),
    onMeta: (value) => { metadata = value; },
  });

  assert.equal(result.reply.content, '# Risk\n- Diversify across assets.\n');
  assert.equal(result.reply.source, 'llm');
  assert.equal(result.streamed, true);
  assert.deepEqual(received, ['# Risk\n', '- Diversify', ' across assets.\n']);
  assert.equal(metadata.source, 'llm');
});

test('postStream preserves a complete Markdown table', async () => {
  const table = [
    '| Order Type | Price | Execution | Outcome |',
    '| --- | --- | --- | --- |',
    '| Market Order | $50 | Immediate | You pay $5,000 and own the shares |',
    '| Limit Order | $48 or better | Only if the market reaches it | You control price but may not fill |',
    '',
  ].join('\n');
  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    `event: token\ndata: ${JSON.stringify({ content: table.slice(0, 96) })}\n\n`,
    `event: token\ndata: ${JSON.stringify({ content: table.slice(96) })}\n\n`,
    'event: done\ndata: {"source":"llm","model":"local","finish_reason":"stop"}\n\n',
  ], 19);

  const result = await postStream('/tutor/chat', {});

  assert.equal(result.reply.content, table);
  assert.match(markdownToHTML(result.reply.content), /Limit Order/);
  assert.match(markdownToHTML(result.reply.content), /You control price but may not fill/);
});

test('postStream handles a final token immediately followed by done at stream close', async () => {
  const content = 'Final sentence.';
  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    `event: token\ndata: ${JSON.stringify({ content })}\n\n`,
    'event: done\ndata: {"source":"llm","model":"local"}',
  ], 5);

  const result = await postStream('/tutor/chat', {});

  assert.equal(result.reply.content, content);
  assert.equal(result.streamed, true);
});

test('postStream reports server stream errors and incomplete or empty output', async () => {
  globalThis.fetch = async () => eventStream([
    'event: error\ndata: {"code":"tutor_unavailable","message":"Model offline"}\n\n',
  ]);
  await assert.rejects(
    postStream('/tutor/chat', {}),
    (error) => error instanceof ApiError && error.code === 'tutor_unavailable' && error.message === 'Model offline',
  );

  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    'event: token\ndata: {"content":"Partial"}\n\n',
  ]);
  await assert.rejects(postStream('/tutor/chat', {}), (error) => error.code === 'incomplete_stream');

  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    'event: done\ndata: {"source":"llm","model":"local"}\n\n',
  ]);
  await assert.rejects(postStream('/tutor/chat', {}), (error) => error.code === 'empty_response');
});

test('postStream reports model output-token limits with details', async () => {
  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    'event: token\ndata: {"content":"Partial table | $"}\n\n',
    'event: error\ndata: {"code":"tutor_output_limit","message":"Length limit","finish_reason":"length","max_tokens":900}\n\n',
  ]);

  await assert.rejects(
    postStream('/tutor/chat', {}),
    (error) => error.code === 'tutor_output_limit' && error.details.finish_reason === 'length' && error.details.max_tokens === 900,
  );
});

test('postStream reports network interruption after partial content as incomplete', async () => {
  globalThis.fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: meta\ndata: {"source":"llm","model":"local"}\n\n' +
          'event: token\ndata: {"content":"Partial"}\n\n',
        ));
        controller.error(new Error('connection lost'));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

  await assert.rejects(postStream('/tutor/chat', {}), (error) => error.code === 'network');
});

test('postStream assembles long answers without dropping or repeating text', async () => {
  const content = 'A financial education answer. '.repeat(240);
  const tokens = [];
  for (let offset = 0; offset < content.length; offset += 137) {
    tokens.push(`event: token\ndata: ${JSON.stringify({ content: content.slice(offset, offset + 137) })}\n\n`);
  }
  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    ...tokens,
    'event: done\ndata: {"source":"llm","model":"local"}\n\n',
  ], 113);

  const result = await postStream('/tutor/chat', {});
  assert.equal(result.reply.content, content);
  assert.equal(result.reply.content.length, content.length);
});

test('UTF-8 stream decoding preserves Unicode split across network chunks through rendering', async () => {
  const answers = [
    'Hello 😊',
    "That's a great question — let's explore it.",
    'Café, naïve, résumé',
    'こんにちは',
    'Diversification helps manage risk 🌱',
  ];
  const received = [];
  const target = { innerHTML: '', isConnected: true };
  const renderer = createAssistantResponseRenderer(target, { reducedMotion: true });
  globalThis.fetch = async () => eventStream([
    'event: meta\ndata: {"source":"llm","model":"local"}\n\n',
    ...answers.map((content) => `event: token\ndata: ${JSON.stringify({ content })}\n\n`),
    'event: done\ndata: {"source":"llm","model":"local"}\n\n',
  ], 1);

  const result = await postStream('/tutor/chat', {}, {
    onChunk: (chunk) => {
      received.push(chunk);
      renderer.append(chunk);
    },
  });
  const expected = answers.join('');

  assert.equal(result.reply.content, expected);
  assert.equal(received.join(''), expected);
  assert.equal(renderer.content, expected);
  assert.equal(target.innerHTML, markdownToHTML(expected));
  renderer.dispose();
});

test('incremental Markdown remains escaped and supports lists and fenced code blocks', () => {
  const rendered = markdownToHTML(
    '# Example\n\n- First\n- Second\n\n[Lesson](#/learn/diversification)\n\n```html\n<script>alert(1)</script>\n```',
  );

  assert.match(rendered, /<h3>Example<\/h3>/);
  assert.match(rendered, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(rendered, /<a href="#\/learn\/diversification">Lesson<\/a>/);
  assert.match(rendered, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);
  assert.doesNotMatch(rendered, /<script>/);
});

test('mock and streamed assistant text share the progressive Markdown renderer exactly once', async () => {
  const mockTarget = { innerHTML: '', isConnected: true };
  const mockRenderer = createAssistantResponseRenderer(mockTarget);
  const mockAnswer = 'A **prewritten** answer with a [source](#/learn/risk).';
  mockRenderer.reveal(mockAnswer);
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(mockRenderer.content, mockAnswer);
  assert.match(mockTarget.innerHTML, /<strong>prewritten<\/strong>/);
  assert.match(mockTarget.innerHTML, /<a href="#\/learn\/risk">source<\/a>/);
  mockRenderer.dispose();

  const streamedTarget = { innerHTML: '', isConnected: true };
  const streamedRenderer = createAssistantResponseRenderer(streamedTarget);
  const chunks = ['A **streamed** answer', ' with [a citation](#/sources/1).'];
  for (const chunk of chunks) streamedRenderer.append(chunk);

  assert.equal(streamedRenderer.content, chunks.join(''));
  assert.equal(streamedTarget.innerHTML.match(/streamed/g)?.length, 1);
  assert.match(streamedTarget.innerHTML, /<a href="#\/sources\/1">a citation<\/a>/);
  streamedRenderer.dispose();
});

test('assistant response renderer honors reduced motion without losing Markdown', () => {
  const target = { innerHTML: '', isConnected: true };
  const answer = '## Immediate **answer**';
  const renderer = createAssistantResponseRenderer(target, { reducedMotion: true });
  renderer.reveal(answer);

  assert.equal(renderer.content, answer);
  assert.match(target.innerHTML, /<h3>Immediate <strong>answer<\/strong><\/h3>/);
  renderer.dispose();
});
