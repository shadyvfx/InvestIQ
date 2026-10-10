import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  dispatchEvent: () => true,
  TRADELAB_CONFIG: {
    dataSource: 'mock',
    tutorApiEnabled: false,
    mockTutorDelayMs: [0, 0],
  },
};

const { config, isMock } = await import('../js/config.js');
const { buildMockReply, FALLBACK_REPLY } = await import('../js/data/mockTutorResponses.js');
const { sendMessage } = await import('../js/services/tutorService.js');
const { initStore } = await import('../js/state.js');

test('the mock tutor remains available when its dedicated API switch is off', async () => {
  assert.equal(config.tutorApiEnabled, false);
  assert.equal(isMock(), true);
  initStore();

  const reply = await sendMessage('Explain candlestick charts to me.');

  assert.equal(reply.meta.source, 'mock');
  assert.ok(reply.content.length > 0);
});

test('mock tutor identity and fallback use TradeLab branding', () => {
  const greeting = buildMockReply({ text: 'Who are you?' });

  assert.match(greeting.content, /TradeLab Tutor|TradeLab's AI tutor/);
  assert.doesNotMatch(greeting.content, /InvestIQ/);
  assert.doesNotMatch(FALLBACK_REPLY, /InvestIQ/);
});
