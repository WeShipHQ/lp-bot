export function splitMessage(
  message: string,
  maxLength: number = 3500
): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  const paragraphs = message.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (paragraph.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = "";
        }

        const lines = paragraph.split(/\n/);
        for (const line of lines) {
          if (currentChunk.length + line.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? "\n" : "") + line;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = line;
          }
        }
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = paragraph;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}
