export function typewriterChunks(text, maxChunkSize = 12) {
  const characters = Array.from(String(text ?? ''));
  const chunks = [];
  const chunkSize = Number.isFinite(maxChunkSize) ? Math.max(1, Math.floor(maxChunkSize)) : 12;
  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(''));
  }
  return chunks;
}
