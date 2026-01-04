export const IndicatorType = {
  /**
   * oddly / evenly / some other regular selection of letters. distinguished
   * from deletion and selection in that it doesn't involve contiguous
   * substrings of letters
   */
  Alternation: "alternation",
  /** odd letters */
  Oddly: "oddly",
  /** even letters */
  Evenly: "evenly",

  /** generic anagram */
  Anagram: "anagram",
  /** rotate letters */
  Rotation: "rotation",
  /** exchange two letters */
  Exchange: "exchange",

  /** generic insertion / container */
  Containment: "containment",
  /** X inserted into Y */
  Insertion: "insertion",
  /** X contains Y */
  Container: "container",

  /** generic deletion of letters. compare selection */
  Deletion: "deletion",
  /** X removing Y */
  Expulsion: "expulsion",
  /** X removed from Y */
  Departure: "departure",
  /** remove prefix */
  Beheading: "beheading",
  /** remove suffix */
  Curtailing: "curtailing",
  /** remove prefix and suffix */
  Trimming: "trimming",
  /** remove center letters */
  Emptying: "emptying",

  /** substring of X */
  Hidden: "hidden",

  /** sounds like X */
  Homophone: "homophone",

  /** reverse X */
  Reversal: "reversal",

  /**
   * generic selection of letters. the difference between deletion and
   * selection is kinda subjective; deletion usually means "take most of the
   * letters of", while selection usually means "take a few of the letters of".
   */
  Selection: "selection",
  /** take prefix */
  Prefix: "prefix",
  /** take suffix */
  Suffix: "suffix",
  /** take prefix and suffix */
  Ends: "ends",
  /** take center letters */
  Centers: "centers",

  /** X, replace Y with Z */
  Substitution: "substitution",
} as const;
export type IndicatorType = (typeof IndicatorType)[keyof typeof IndicatorType];

const indicatorAbbr: Record<IndicatorType, string> = {
  [IndicatorType.Alternation]: "t",
  [IndicatorType.Oddly]: "o",
  [IndicatorType.Evenly]: "e",

  [IndicatorType.Anagram]: "a",
  [IndicatorType.Rotation]: "z",
  [IndicatorType.Exchange]: "x",

  [IndicatorType.Containment]: "c",
  [IndicatorType.Insertion]: "i",
  [IndicatorType.Container]: "k",

  [IndicatorType.Deletion]: "d",
  [IndicatorType.Expulsion]: "l",
  [IndicatorType.Departure]: "j",
  [IndicatorType.Beheading]: "b",
  [IndicatorType.Curtailing]: "y",
  [IndicatorType.Trimming]: "w",
  [IndicatorType.Emptying]: "m",

  [IndicatorType.Hidden]: "h",

  [IndicatorType.Homophone]: "f",

  [IndicatorType.Reversal]: "r",

  [IndicatorType.Selection]: "v",
  [IndicatorType.Prefix]: "p",
  [IndicatorType.Suffix]: "q",
  [IndicatorType.Ends]: "n",
  [IndicatorType.Centers]: "u",

  [IndicatorType.Substitution]: "s",
};

const abbrIndicator: Record<string, IndicatorType> = {};
for (const [type, abbr] of Object.entries(indicatorAbbr)) {
  if (abbrIndicator[abbr]) {
    throw new Error(`duplicate abbr: ${abbr}`);
  }
  abbrIndicator[abbr] = type as IndicatorType;
}

const DIGIT = /[0-9]/;

class IndicatorNode {
  lemma: string;
  children: Map<string, IndicatorNode>;
  scores: Map<IndicatorType, number>;

  constructor(lemma: string) {
    this.lemma = lemma;
    this.children = new Map();
    this.scores = new Map();
  }

  *dump(): Generator<string> {
    yield [this.lemma, this.dumpScores(), this.children.size > 0 ? ">" : ""]
      .filter(Boolean)
      .join(" ");
    for (const child of this.children.values()) {
      yield* child.dump();
    }
    if (this.children.size > 0) {
      yield "<";
    }
  }

  dumpScores(): string {
    return Array.from(this.scores)
      .sort((a, b) => b[1] - a[1])
      .flatMap(([type, score]) => [indicatorAbbr[type], score])
      .join("");
  }

  parseScores(scores?: string) {
    if (!scores) {
      return;
    }
    let i = 0;
    while (i < scores.length) {
      const type = abbrIndicator[scores[i]!];
      if (!type) {
        throw new Error(`unknown abbr: ${scores[i]!}`);
      }
      const startDigit = i++;
      while (i < scores.length && DIGIT.test(scores[i]!)) {
        i++;
      }
      const score = parseInt(scores.slice(startDigit, i++), 10);
      this.scores.set(type, score);
    }
  }

  insert(lemmas: string[], type: IndicatorType, score: number) {
    if (lemmas.length === 0) {
      this.scores.set(type, (this.scores.get(type) ?? 0) + score);
      return;
    }
    const [first, ...rest] = lemmas as [string, ...string[]];
    const child = this.children.get(first);
    if (child === undefined) {
      this.children.set(first, new IndicatorNode(first));
    }
    this.children.get(first)!.insert(rest, type, score);
  }

  *follow(
    lemmas: string[],
    start: number,
    end: number,
  ): Generator<{
    start: number;
    end: number;
    type: IndicatorType;
    score: number;
  }> {
    for (const [type, score] of this.scores) {
      yield { start, end, type, score };
    }
    const child = lemmas[end + 1]
      ? this.children.get(lemmas[end + 1]!)
      : undefined;
    if (child === undefined) {
      return;
    }
    yield* child.follow(lemmas, start, end + 1);
  }
}

export class Indicators {
  children: Map<string, IndicatorNode>;

  constructor() {
    this.children = new Map();
  }

  dump(): string[] {
    const lines = [];
    for (const child of this.children.values()) {
      lines.push(...child.dump());
    }
    return lines;
  }

  parse(lines: string[]) {
    const stack: (this | IndicatorNode)[] = [this];
    for (const line of lines) {
      if (line === "<") {
        stack.pop();
        continue;
      }
      const [lemma, ...parts] = line.split(" ");
      const hasChildren = parts.at(-1) === ">" ? !!parts.pop() : false;
      const node = new IndicatorNode(lemma!);
      node.parseScores(parts[0]);
      stack.at(-1)!.children.set(lemma!, node);
      if (hasChildren) {
        stack.push(node);
      }
    }
  }

  insert(lemmas: string[], type: IndicatorType, score: number) {
    if (lemmas.length === 0) {
      return;
    }
    const [first, ...rest] = lemmas as [string, ...string[]];
    const child = this.children.get(first);
    if (child === undefined) {
      this.children.set(first, new IndicatorNode(first));
    }
    this.children.get(first)!.insert(rest, type, score);
  }

  *match(lemmas: string[]): Generator<{
    start: number;
    end: number;
    type: IndicatorType;
    score: number;
  }> {
    for (let start = 0; start < lemmas.length; start++) {
      const child = this.children.get(lemmas[start]!);
      if (!child) {
        continue;
      }
      for (const result of child.follow(lemmas, start, start)) {
        yield result;
      }
    }
  }
}
