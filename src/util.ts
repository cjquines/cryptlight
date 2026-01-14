export function interval(start: number, end: number, step = 1): number[] {
  const result = [];
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    result.push(i);
  }
  return result;
}

export function anagrams(word: string): Set<string> {
  const anagrams = new Set<string>([word]);
  const letters = Array.from(word);

  const n = word.length;
  const indices = interval(0, n - 1);
  const cycles = interval(n, 1, -1);

  while (n > 0) {
    let broke = false;

    for (let i = n - 1; i >= 0; i--) {
      cycles[i]! -= 1;
      if (cycles[i] === 0) {
        indices.push(...indices.splice(i, 1));
        cycles[i] = n - i;
      } else {
        const j = cycles[i]!;

        const k = indices[i]!;
        indices[i] = indices[n - j]!;
        indices[n - j] = k;

        anagrams.add(indices.map((i) => letters[i]).join(""));
        broke = true;
        break;
      }
    }

    if (!broke) {
      return anagrams;
    }
  }

  return anagrams;
}
