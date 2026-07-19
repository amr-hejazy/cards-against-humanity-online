const MAX_GETRANDOMVALUES_BYTES = 65536;

// Returns a shuffled copy of an array using the Fisher-Yates algorithm
export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  const rand = new Uint32Array(copy.length);
  const maxLen = MAX_GETRANDOMVALUES_BYTES / Uint32Array.BYTES_PER_ELEMENT;
  for (let offset = 0; offset < rand.length; offset += maxLen) {
    const end = Math.min(offset + maxLen, rand.length);
    crypto.getRandomValues(rand.subarray(offset, end));
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
