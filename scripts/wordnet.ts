import { slugify } from "cromulence";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const POS = {
  Noun: "n",
  Verb: "v",
  Adjective: "a",
  Adverb: "r",
} as const;
export type POS = (typeof POS)[keyof typeof POS];

const posToFileName = {
  [POS.Noun]: "noun",
  [POS.Verb]: "verb",
  [POS.Adjective]: "adj",
  [POS.Adverb]: "adv",
};

const posDetachment = {
  [POS.Noun]: [
    [/s$/, ""],
    [/ses$/, "s"],
    [/xes$/, "x"],
    [/zes$/, "z"],
    [/ches$/, "ch"],
    [/shes$/, "sh"],
    [/men$/, "man"],
    [/ies$/, "y"],
  ],
  [POS.Verb]: [
    [/s$/, ""],
    [/ies$/, "y"],
    [/es$/, "e"],
    [/es$/, ""],
    [/ing$/, "e"],
    [/ing$/, ""],
  ],
  [POS.Adjective]: [
    [/er$/, ""],
    [/est$/, ""],
    [/er$/, "e"],
    [/est$/, "e"],
  ],
  [POS.Adverb]: [],
} satisfies Record<POS, [RegExp, string][]>;

export const SynsetType = {
  Noun: "n",
  Verb: "v",
  Adjective: "a",
  AdjectiveSatellite: "s",
  Adverb: "r",
} as const;
export type SynsetType = (typeof SynsetType)[keyof typeof SynsetType];

export const Pointer = {
  // noun
  Antonym: "!",
  Hypernym: "@",
  InstanceHypernym: "@i",
  Hyponym: "~",
  InstanceHyponym: "~i",
  MemberHolonym: "#m",
  SubstanceHolonym: "#s",
  PartHolonym: "#p",
  MemberMeronym: "%m",
  SubstanceMeronym: "%s",
  PartMeronym: "%p",
  Attribute: "=",
  Derivation: "+",
  DomainTopic: ";c",
  MemberDomainTopic: "-c",
  DomainRegion: ";r",
  MemberDomainRegion: "-r",
  DomainUsage: ";u",
  MemberDomainUsage: "-u",

  // verb
  // Antonym: "!",
  // Hypernym: "@",
  // Hyponym: "~",
  Entailment: "*",
  Cause: ">",
  AlsoSee: "^",
  VerbGroup: "$",
  // Derivation: "+",
  // DomainTopic: ";c",
  // DomainRegion: ";r",
  // DomainUsage: ";u",

  // adjective
  // Antonym: "!",
  SimilarTo: "&",
  ParticipleOf: "<",
  Pertainym: "\\",
  // Attribute: "=",
  // AlsoSee: "^",
  // DomainTopic: ";c",
  // DomainRegion: ";r",
  // DomainUsage: ";u",

  // adverb
  // Antonym: "!",
  // DerivedFrom: "\\",
  // DomainTopic: ";c",
  // DomainRegion: ";r",
  // DomainUsage: ";u",
} as const;
export type Pointer = (typeof Pointer)[keyof typeof Pointer];

export class Word {
  lemma: string;
  pos: POS;
  pointers: Pointer[];
  tagSenseCount: number;
  synsetOffsets: number[];

  constructor(
    lemma: string,
    pos: POS,
    pointers: Pointer[],
    tagSenseCount: number,
    synsetOffsets: number[],
  ) {
    this.lemma = lemma;
    this.pos = pos;
    this.pointers = pointers;
    this.tagSenseCount = tagSenseCount;
    this.synsetOffsets = synsetOffsets;
  }

  static parse(line: string): Word {
    const [lemma, pos, ...parts] = line.split(" ");
    const synsetCount = parseInt(parts.shift()!, 10);
    const pointerCount = parseInt(parts.shift()!, 10);
    const pointers: Pointer[] = [];
    for (let i = 0; i < pointerCount; i++) {
      pointers.push(parts.shift()! as Pointer);
    }
    const [, tagSenseCount, ...synsetOffsets] = parts;

    return new Word(
      lemma!,
      pos as POS,
      pointers,
      parseInt(tagSenseCount!, 10),
      synsetOffsets.slice(0, synsetCount).map((x) => parseInt(x, 10)),
    );
  }
}

export class Synset {
  category?: Category;
  synsetOffset: number;
  lexFileNum: number;
  synsetType: SynsetType;
  words: { word: string; lexId: number }[];
  pointers: {
    pointer: Pointer;
    synsetOffset: number;
    pos: POS;
    source: number;
    target: number;
  }[];
  frames: { frame: number; word: number }[];
  gloss: string;

  constructor(
    synsetOffset: number,
    lexFileNum: number,
    synsetType: SynsetType,
    words: { word: string; lexId: number }[],
    pointers: {
      pointer: Pointer;
      synsetOffset: number;
      pos: POS;
      source: number;
      target: number;
    }[],
    frames: { frame: number; word: number }[],
    gloss: string,
  ) {
    this.synsetOffset = synsetOffset;
    this.lexFileNum = lexFileNum;
    this.synsetType = synsetType;
    this.words = words;
    this.pointers = pointers;
    this.frames = frames;
    this.gloss = gloss;
  }

  static parse(line: string): Synset {
    const [meta, gloss] = line.split("|");
    const [synsetOffset, lexFileNum, synsetType, ...parts] = meta!.split(" ");

    const wordCount = parseInt(parts.shift()!, 16);
    const words = [];
    for (let i = 0; i < wordCount; i++) {
      words.push({
        word: parts.shift()!,
        lexId: parseInt(parts.shift()!, 16),
      });
    }

    const pointerCount = parseInt(parts.shift()!, 10);
    const pointers = [];
    for (let i = 0; i < pointerCount; i++) {
      const pointer = parts.shift()! as Pointer;
      const synsetOffset = parseInt(parts.shift()!, 10);
      const pos = parts.shift()! as POS;
      const sourceTargetHex = parts.shift()!;
      const source = parseInt(sourceTargetHex.slice(0, 2), 16);
      const target = parseInt(sourceTargetHex.slice(2, 4), 16);
      pointers.push({
        pointer,
        synsetOffset,
        pos,
        source,
        target,
      });
    }

    const frames = [];
    if (parts.length > 0 && parts[0]!.length > 0) {
      const frameCount = parseInt(parts.shift()!, 10);
      for (let i = 0; i < frameCount; i++) {
        parts.shift()!; // always a '+'
        frames.push({
          frame: parseInt(parts.shift()!, 10),
          word: parseInt(parts.shift()!, 16),
        });
      }
    }

    return new Synset(
      parseInt(synsetOffset!, 10),
      parseInt(lexFileNum!, 10),
      synsetType as SynsetType,
      words,
      pointers,
      frames,
      gloss?.trim() ?? "",
    );
  }

  attach(category: Category): void {
    this.category = category;
  }

  *follow(pointer: Pointer): Generator<Synset> {
    for (const p of this.pointers) {
      if (p.pointer === pointer) {
        yield this.category!.getSynset(p.synsetOffset)!;
      }
    }
  }

  get word(): string {
    return this.words[0]?.word ?? "?";
  }
}

export class SortedLookup<T, const K extends keyof T> {
  key: K;
  data: T[];
  lt: (a: T[K], b: T[K]) => boolean;

  constructor(data: T[], key: K, lt: (a: T[K], b: T[K]) => boolean) {
    this.key = key;
    this.data = data;
    this.lt = lt;
  }

  private binarySearch(needle: T[K]): number {
    let left = 0;
    let right = this.data.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      const value = this.data[middle]![this.key];
      if (this.lt(value, needle)) {
        left = middle + 1;
      } else if (this.lt(needle, value)) {
        right = middle;
      } else {
        return middle;
      }
    }
    return left;
  }

  get(needle: T[K]): T | undefined {
    const index = this.binarySearch(needle);
    const result = this.data[index];
    return result?.[this.key] === needle ? result : undefined;
  }
}

const enCollator = new Intl.Collator("en");

export class Category {
  private pos: POS;
  private words: SortedLookup<Word, "lemma">;
  private synsets: SortedLookup<Synset, "synsetOffset">;
  private exceptions: SortedLookup<string[], 0>;

  constructor(
    pos: POS,
    words: Word[],
    synsets: Synset[],
    exceptions: string[][],
  ) {
    this.pos = pos;
    this.words = new SortedLookup(
      words,
      "lemma",
      (a, b) => enCollator.compare(a, b) < 0,
    );
    this.synsets = new SortedLookup(synsets, "synsetOffset", (a, b) => a < b);
    this.exceptions = new SortedLookup(
      exceptions,
      0,
      (a, b) => enCollator.compare(a, b) < 0,
    );
  }

  static async fromDir(dirName: string, pos: POS): Promise<Category> {
    const posName = posToFileName[pos];

    const words = [];
    const indexPath = path.join(dirName, `index.${posName}`);
    const indexFile = await fs.readFile(indexPath, "utf-8");
    for (const line of indexFile.split("\n")) {
      if (line.startsWith(" ")) {
        continue;
      }
      words.push(Word.parse(line));
    }

    const synsets = [];
    const dataPath = path.join(dirName, `data.${posName}`);
    const dataFile = await fs.readFile(dataPath, "utf-8");
    for (const line of dataFile.split("\n")) {
      if (line.startsWith(" ")) {
        continue;
      }
      synsets.push(Synset.parse(line));
    }

    const exceptions = [];
    const exceptionsPath = path.join(dirName, `${posName}.exc`);
    const exceptionsFile = await fs.readFile(exceptionsPath, "utf-8");
    for (const line of exceptionsFile.split("\n")) {
      if (line.startsWith(" ")) {
        continue;
      }
      exceptions.push(line.split(" "));
    }

    return new Category(pos, words, synsets, exceptions);
  }

  private *lemmatize(word: string): Generator<string> {
    const slug = slugify(word);
    const exceptions = this.exceptions.get(slug);
    if (exceptions) {
      yield* exceptions;
      return;
    }
    yield word;
    for (const [regex, replacement] of posDetachment[this.pos]) {
      if (regex.test(word)) {
        yield word.replace(regex, replacement);
      }
    }
  }

  getSynset(offset: number): Synset | undefined {
    const synset = this.synsets.get(offset);
    if (synset) {
      synset.attach(this);
    }
    return synset;
  }

  *getSynsets(word: string): Generator<Synset> {
    const seenLemmas = new Set<string>();
    const seenOffsets = new Set<number>();
    for (const lemma of this.lemmatize(word)) {
      if (seenLemmas.has(lemma)) {
        continue;
      }
      seenLemmas.add(lemma);
      const word = this.words.get(lemma);
      if (!word) {
        continue;
      }
      for (const offset of word.synsetOffsets) {
        if (seenOffsets.has(offset)) {
          continue;
        }
        seenOffsets.add(offset);
        yield this.getSynset(offset)!;
      }
    }
  }
}

export class Wordnet {
  private categories: Record<POS, Category>;

  constructor(categories: Record<POS, Category>) {
    this.categories = categories;
  }

  static async fromDir(dirName: string): Promise<Wordnet> {
    const categories = {} as Record<POS, Category>;
    for (const pos of Object.values(POS)) {
      categories[pos] = await Category.fromDir(dirName, pos);
    }
    return new Wordnet(categories);
  }

  getSynset(pos: POS, offset: number): Synset | undefined {
    return this.categories[pos].getSynset(offset);
  }

  *getSynsets(word: string, pos?: POS): Generator<Synset> {
    for (const p of pos ? [pos] : Object.values(POS)) {
      yield* this.categories[p].getSynsets(word);
    }
  }
}
