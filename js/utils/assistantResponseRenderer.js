import { markdownToHTML } from './markdown.js';
import { typewriterChunks } from './typewriter.js';

export function createAssistantResponseRenderer(target, { onUpdate = () => {}, reducedMotion = false } = {}) {
  const timers = new Set();
  let visible = '';

  const append = (chunk) => {
    visible += chunk;
    target.innerHTML = markdownToHTML(visible);
    onUpdate();
  };

  const reveal = (content) => {
    if (reducedMotion) {
      append(content);
      return;
    }
    const length = Array.from(content).length;
    const chunks = typewriterChunks(content, Math.max(12, Math.ceil(length / 120)));
    const revealNext = () => {
      const chunk = chunks.shift();
      if (chunk === undefined || !target.isConnected) return;
      append(chunk);
      const timer = setTimeout(() => {
        timers.delete(timer);
        revealNext();
      }, 16);
      timers.add(timer);
    };
    revealNext();
  };

  return {
    append,
    reveal,
    get content() {
      return visible;
    },
    dispose() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
