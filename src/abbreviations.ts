export class Abbreviations {
  data: Map<string, Map<string, number>>;

  constructor() {
    this.data = new Map();
  }

  dump(): string[] {
    const lines = [];
    for (const [lemma, abbreviations] of this.data) {
      const line = [lemma];
      for (const [abbreviation, score] of abbreviations) {
        line.push(abbreviation, score.toString());
      }
      lines.push(line.join(" "));
    }
    return lines;
  }

  parse(lines: string[]) {
    for (const line of lines) {
      const [lemma, ...parts] = line.split(" ");
      for (let i = 0; i < parts.length; i += 2) {
        this.insert(lemma!, parts[i]!, parseInt(parts[i + 1]!, 10));
      }
    }
  }

  insert(lemma: string, abbreviation: string, score: number) {
    if (!this.data.has(lemma)) {
      this.data.set(lemma, new Map());
    }
    this.data
      .get(lemma)!
      .set(
        abbreviation,
        (this.data.get(lemma)!.get(abbreviation) ?? 0) + score,
      );
  }

  get(lemma: string): { abbreviation: string; score: number }[] {
    const result: { abbreviation: string; score: number }[] = [];
    for (const [abbreviation, score] of this.data.get(lemma) ?? []) {
      result.push({ abbreviation, score });
    }
    return result.sort((a, b) => b.score - a.score);
  }
}
