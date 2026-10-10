import test from 'node:test';
import assert from 'node:assert/strict';

import { typewriterChunks } from '../js/utils/typewriter.js';

test('typewriter chunks preserve all text and do not split Unicode characters', () => {
  const examples = [
    'Hello 😊',
    "That's a great question — let's explore it.",
    'Café, naïve, résumé',
    'こんにちは',
    'Diversification helps manage risk 🌱',
  ];

  for (const text of examples) {
    const chunks = typewriterChunks(text, 7);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 7));
  }
});
