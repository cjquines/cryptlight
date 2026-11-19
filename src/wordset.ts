import { Cromulence, slugify } from "cromulence";
import { abbreviationKey, Abbreviations } from "./abbreviations.js";
import * as AsyncIter from "./asyncIterable.js";
import * as Iter from "./iterable.js";
import { datamuse } from "./datamuse.js";
import { inflect, lemmatize, uninflect } from "./nlp.js";
import { Pattern } from "./pattern.js";
import { anagrams, Interval, interval, subsequences, Yielder } from "./util.js";

/** A WordDerivation as plain data. */
export type DerivationData = {
  words: string[];
  description: string;
  /** The `id` of the wordset that created it, if any. */
  node: string | null;
  parents: DerivationData[];
};

/** A string of "words" and how they were produced. */
export class WordDerivation {
  private _words: string[] | undefined;

  /**
   * The string itself. An array of uppercase-letter-only slugs, interpreted
   * as a space-separated string.
   *
   * Most transformations don't care about spacing, but a few do. (Consider
   * "the heads of...", which selects the first letters of each word.) So we
   * maintain an array to preserve spacing when needed.
   */
  get words(): string[] {
    return this._words ?? [this.description.replaceAll(/[^A-Z]/g, "")];
  }

  /**
   * Human-readable description of how the words were produced.
   *
   * Wordplay should use clue-answer notation, like AT(-o)D, TEN<, or AT(TEN)D.
   */
  description: string;
  /**
   * Words that were used to produce this one. Possibly empty, if it's given
   * as input.
   *
   * The parents of AT(TEN)D are ATD and TEN, each of which could have its
   * own parents. The former might be AT(-o)D, which has parents ATOD and O;
   * the latter might be TEN<, which has parent NET, etc.
   */
  parents: WordDerivation[];
  /**
   * The wordset that created this. Set when it's first yielded from a run;
   * pass-through wordsets (union, match, ...) keep their child's.
   */
  source: Wordset | undefined = undefined;

  constructor({
    words,
    description,
    parents = [],
  }: {
    words?: string[];
    description: string;
    parents?: WordDerivation[];
  }) {
    this._words = words;
    this.description = description;
    this.parents = parents;
  }

  #joined: string | undefined = undefined;

  /** this.words.join("") */
  get joined(): string {
    return (this.#joined ??= this.words.join(""));
  }

  /**
   * The string of letters to use when rendering this in a wordplay
   * description.
   */
  toString(): string {
    return this._words ? this._words.join("") : this.description;
  }

  /**
   * Transform the uppercase letters of this.toString(), leaving the lowercase
   * letters intact.
   */
  mapString(fn: (letter: string, index: number) => string[]): string {
    const mapped = [];
    let index = 0;
    for (const letter of this.toString()) {
      mapped.push(...(/[A-Z]/.exec(letter) ? fn(letter, index++) : [letter]));
    }
    return mapped.join("");
  }

  ifMatches(pattern: Pattern): this | null {
    return pattern.test(this.joined) ? this : null;
  }

  #json: DerivationData | undefined = undefined;

  /** This as plain data. Cached. Call only once yielded, so `source` is set. */
  toJSON(): DerivationData {
    return (this.#json ??= {
      words: this.words,
      description: this.description,
      node: this.source?.id ?? null,
      parents: this.parents.map((parent) => parent.toJSON()),
    });
  }
}

export type WordsetData = {
  wordlist: Record<string, number>;
  abbreviations: string[];
};

/** What a run is asked for. */
export type RunArgs = {
  pattern: Pattern;
  /**
   * Only derivations whose `joined` is a candidate are wanted.
   * Implementations may use it to prune their search, or ignore it: `run`
   * filters the results either way.
   */
  candidates?: ReadonlySet<string> | undefined;
};

/** Compile-time args for wordset and descendants. Run narrows further. */
export type Plan = {
  node: Wordset;
  args: RunArgs;
  children: Plan[];
};

/** One child's compile-time args, as declared by its parent's `_plan`. */
type PlanStep = Pick<Plan, "node" | "args">;

/** Runs a child with compile-time plan args plus run-time narrowing. */
type RunChild = (
  child: Wordset,
  narrower?: { candidates: ReadonlySet<string> },
) => AsyncIterable<WordDerivation>;

/** Runs yield to event loop at least once per 50 ms. */
const yielder = new Yielder(50);

/**
 * A lazy pipeline over "words", materialized as an iterator of WordDerivations
 * exactly once.
 *
 * For example, the solution to the cryptic clue "Escort is tad confused about
 * returning profit (6)" can be found by:
 *
 * const definition = Wordset.synonym("Escort");
 * const tadConfused = Wordset.literal("tad").anagram();
 * const returningProfit = Wordset.synonym("profit").reverse();
 * const wordplay = tadConfused.insert(returningProfit);
 * const results = await definition.intersect(wordplay).matches(/^.{6}$/);
 */
export abstract class Wordset {
  static abbreviations: Abbreviations;
  static cromulence: Cromulence;

  static load(data: WordsetData): void {
    Wordset.abbreviations = new Abbreviations();
    Wordset.abbreviations.parse(data.abbreviations);
    Wordset.cromulence = new Cromulence(data.wordlist);
    wordsByLength = null;
  }

  /** Possible `joined` lengths of results. */
  abstract _length(): Interval;

  /**
   * Each child with the args it runs under, given this wordset's args.
   * Compile-time. Leaves return [].
   */
  abstract _plan(args: RunArgs): PlanStep[];

  /**
   * Yield WordDerivations (or null) matching the wordset filters and `args`.
   * Children *must* be run through `runChild`.
   */
  abstract _run(
    args: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null>;

  #length: Interval | null = null;

  /** Possible `joined` lengths of results. */
  get length(): Interval {
    return (this.#length ??= this._length());
  }

  /** Identifies this wordset to callers, e.g. the node `build` made it from. */
  id: string | undefined = undefined;

  private hasRun = false;

  /**
   * Yield WordDerivations matching the wordset filters and the given regex,
   * and, if given, whose `joined` is one of `candidates`. Single-use.
   *
   * Aborting `signal` makes the run throw its reason. Long runs also yield to
   * the event loop now and then, so a worker can receive the abort.
   */
  run(
    input?: RegExp | Pattern | Interval,
    candidates?: ReadonlySet<string>,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<WordDerivation> {
    return this.execute(this.plan(input, candidates), options.signal);
  }

  /** Run `plan`, which must be a plan of this. Single-use. */
  private async *execute(
    plan: Plan,
    signal: AbortSignal | undefined,
  ): AsyncIterable<WordDerivation> {
    if (this.hasRun) {
      throw new Error("Wordset.run may only be called once");
    }
    this.hasRun = true;

    const { args } = plan;
    if (args.pattern.length.isEmpty()) {
      return;
    }

    const plans = new Map(plan.children.map((child) => [child.node, child]));
    const runChild: RunChild = (child, narrower) => {
      const childPlan = plans.get(child);
      if (childPlan === undefined) {
        throw new Error("runChild: not a child declared by _plan");
      }
      if (narrower === undefined) {
        return child.execute(childPlan, signal);
      }
      // Narrowed candidates change what descendants are asked for, so
      // re-plan this subtree.
      const planCands = childPlan.args.candidates;
      const narrowCands = narrower.candidates;
      return child.execute(
        child.planWith({
          pattern: childPlan.args.pattern,
          candidates: planCands
            ? planCands.intersection(narrowCands)
            : narrowCands,
        }),
        signal,
      );
    };

    for await (const item of this._run(args, runChild)) {
      signal?.throwIfAborted();
      await yielder.yield();
      if (item !== null && (args.candidates?.has(item.joined) ?? true)) {
        item.source ??= this;
        yield item;
      }
    }
  }

  /** Compile-time args this Wordset would run. Can call any number of times. */
  plan(
    input?: RegExp | Pattern | Interval,
    candidates?: ReadonlySet<string>,
  ): Plan {
    return this.planWith({ pattern: Pattern.from(input), candidates });
  }

  private planWith(args: RunArgs): Plan {
    const empty = args.pattern.length.isEmpty();
    return {
      node: this,
      args,
      children: this._plan(args).map((step) =>
        step.node.planWith(empty ? { pattern: Pattern.never } : step.args),
      ),
    };
  }

  // sources:

  /** A literal string. */
  static literal(words: string): Wordset {
    return new Literal(words);
  }

  /** A synonym (or abbreviation) of some string. */
  static synonym(words: string): Wordset {
    return new Synonym(words);
  }

  /** Given strings, each read like a literal. */
  static values(words: string[]): Wordset {
    return new Values(words);
  }

  /** Every possible string with `length`. */
  static any(length: Interval): Wordset {
    return new Any(length);
  }

  /** Every word in the wordlist, most frequent first within each length. */
  static wordlist(): Wordset {
    return new Wordlist();
  }

  // cryptic-y transformations:
  //
  // Operations described as acting on "each word" also treat a phrase as a
  // single word: "giant cave" curtails to GIAN CAV (and so on) and to GIANTCAV.

  /**
   * Alternating letters of this: ThIs or tHiS.
   */
  alternate(offset: 0 | 1): Wordset {
    return new Alternate(this, offset);
  }

  /**
   * Anagrams: THIS*.
   *
   * It's *probably* a mistake to anagram a wordset with more than one item,
   * but we don't check that.
   */
  anagram(): Wordset {
    return new Anagram(this);
  }

  /**
   * Delete a leading substring of each word: (-t)HIS.
   */
  behead(): Wordset {
    return new Slice(this, "reach", "stop", "delete");
  }

  /**
   * Center letters of each word: _HI_.
   *
   * Drops an equal number (>= 1) of letters from each end, keeping the middle.
   */
  centers(): Wordset {
    return new Centers(this);
  }

  /**
   * Concat this with other: THIS+OTHER.
   *
   * This is called "charades" in cryptic clues. They're not quite the same,
   * though, because this preserve spacing.
   */
  concat(other: Wordset): Wordset {
    return new Concat(this, other);
  }

  /**
   * Delete a trailing substring of each word: THI(-s).
   */
  curtail(): Wordset {
    return new Slice(this, "stop", "reach", "delete");
  }

  /**
   * Delete the *subsequence* other from this: TH(-other)IS.
   *
   * Compare with deleteAll, which removes all instances at once.
   * Compare with remove, which takes indices, rather than letters.
   *
   * Letters are removed in order. To remove them in any order ("oil-less
   * idol"), delete `other.anagram()`.
   */
  delete(other: Wordset): Wordset {
    return new Delete(this, other);
  }

  /**
   * Delete all appearances of other from this: TH(-other)IS.
   *
   * Compare with delete, which removes a single subsequence.
   * Compare with remove, which takes indices, rather than letters.
   */
  deleteAll(other: Wordset): Wordset {
    return new DeleteAll(this, other);
  }

  /**
   * Delete some (strictly) middle substring of each word: T(-hi)S.
   */
  ends(): Wordset {
    return new Slice(this, "stop", "stop", "delete");
  }

  /**
   * A homophone of this: "THIS".
   */
  homophone(): Wordset {
    return new Homophone(this);
  }

  /**
   * Insert other into this: TH(OTHER)IS.
   *
   * This is called "containment" in cryptic clues.
   */
  insert(other: Wordset): Wordset {
    return new Insert(this, other);
  }

  /**
   * Move one letter to another position: LAST gives SLAT, ASLT, ...
   *
   * Acts on the phrase as a whole. Compare with `rotate`, which only moves
   * a letter between the ends.
   */
  moveLetter(): Wordset {
    return new MoveLetter(this, "any");
  }

  /**
   * Concat this with other, sharing letters where they meet:
   * RESPONSIVE + VELY → RESPONSIVELY.
   *
   * At least one letter is shared, and each side keeps at least one letter
   * of its own.
   */
  overlap(other: Wordset): Wordset {
    return new Overlap(this, other);
  }

  /**
   * A (proper) prefix of each word: TH_.
   *
   * Not a special case of substring, because this maps per-word.
   */
  prefix(): Wordset {
    return new Slice(this, "reach", "stop", "keep");
  }

  /**
   * Remove the specified indices from each word in this: TH(-i)S TH(-a)T.
   *
   * Indices can be negative, to handle indicators like "endless", which mean
   * removing the last letters.
   */
  remove(indices: number[]): Wordset {
    return new Remove(this, indices);
  }

  /**
   * Replace from in this with to: T(from→TO)S.
   *
   * If from appears more than once, each occurrence gives its own result:
   * THAT gives (t→W)HAT and THA(t→W). Compare with `replaceAll`.
   */
  replace(from: Wordset, to: Wordset): Wordset {
    return new Replace(this, from, to);
  }

  /**
   * Replace all from in this with to: T(from→TO)S.
   *
   * Replacing every instance is uncommon: you probably want `replace` instead.
   */
  replaceAll(from: Wordset, to: Wordset): Wordset {
    return new ReplaceAll(this, from, to);
  }

  /**
   * Replace each word's letters at indices with to: (t→TO)H(i→TO)S.
   *
   * `indices` may be negative, counting from the end.
   */
  replaceAt(indices: number[], to: Wordset): Wordset {
    return new ReplaceAt(this, indices, to);
  }

  /**
   * Reverse this: SIHT<.
   *
   * Technically a special case of anagrams. But unlike anagrams, it's usually
   * fine to reverse a wordset with more than one item.
   */
  reverse(): Wordset {
    return new Reverse(this);
  }

  /**
   * Move the first letter to the end, or the last letter to the front:
   * LAST gives ASTL and TLAS.
   */
  rotate(): Wordset {
    return new MoveLetter(this, "ends");
  }

  /**
   * Select the specified indices from each word in this: _I_ _A_.
   *
   * Indices can be negative, to handle indicators like "tails of", which mean
   * selecting the last letters.
   */
  select(indices: number[]): Wordset {
    return new Select(this, indices);
  }

  /**
   * Swap the starts of two words: BOAT SHOE gives SHOAT BOE (swapping the
   * leading consonants) and SOAT BHOE (swapping first letters).
   *
   * Spoonerisms are about sound, so chain `homophone` to respell the result.
   */
  spoonerism(): Wordset {
    return new Spoonerism(this);
  }

  /**
   * Substring of this: _HI_.
   *
   * This is called "hidden word" in cryptic clues.
   */
  substring(): Wordset {
    return new Substring(this);
  }

  /**
   * A (proper) suffix of each word: _IS.
   *
   * Not a special case of substring, because this maps per-word.
   */
  suffix(): Wordset {
    return new Slice(this, "stop", "reach", "keep");
  }

  // non-cryptic-y transformations:

  /**
   * Intersect this and other: THIS = OTHER.
   *
   * We ignore spacing when intersecting. This is materialized first and its
   * results are checked against other, so this should be the smaller side:
   * usually the definition, with the wordplay as other.
   */
  intersect(other: Wordset): Wordset {
    return new Intersect(this, other);
  }

  static intersect(sets: Iterable<Wordset>): Wordset {
    let result: Wordset | null = null;
    for (const set of sets) {
      if (result === null) {
        result = set;
      } else {
        result = result.intersect(set);
      }
    }
    if (result === null) {
      throw new Error("empty intersection");
    }
    return result;
  }

  union(other: Wordset): Wordset {
    return new Union(this, other);
  }

  static union(sets: Iterable<Wordset>): Wordset {
    let result: Wordset | null = null;
    for (const set of sets) {
      if (result === null) {
        result = set;
      } else {
        result = result.union(set);
      }
    }
    if (result === null) {
      throw new Error("empty union");
    }
    return result;
  }

  /**
   * Take only the words that are "word-like".
   *
   * Specifically, we take the words that have a non-negative cromulence.
   */
  wordlike(): Wordset {
    return new Wordlike(this);
  }

  /**
   * Map each result through `fn`, which gets its words (keeping spacing) and
   * returns new strings. `name` describes the map in derivations.
   *
   * `fn` is opaque, so nothing is pushed down: this runs unconstrained.
   */
  flatMap(
    fn: (words: string[]) => Iterable<string>,
    name = "flatMap",
  ): Wordset {
    return new FlatMap(this, fn, name);
  }

  /** Take only the words matching `pattern`. */
  match(pattern: RegExp | Pattern): Wordset {
    return new Match(this, Pattern.from(pattern));
  }

  /** Drop the given words. Spacing is ignored. */
  exclude(words: string[]): Wordset {
    return new Exclude(this, words);
  }

  // convenience sinks:

  async matches(
    input?: RegExp | Pattern | Interval,
  ): Promise<WordDerivation[]> {
    const matches: WordDerivation[] = [];
    for await (const item of this.run(input)) {
      matches.push(item);
    }
    return matches;
  }

  async all(): Promise<WordDerivation[]> {
    return this.matches();
  }
}

/** Uppercase slugs of each space-separated word of `words`. */
function slugs(words: string): string[] {
  return words
    .split(" ")
    .map((word) => slugify(word).toUpperCase())
    .filter((slug) => slug.length > 0);
}

function literalDerivation(words: string): WordDerivation {
  return new WordDerivation({
    words: slugs(words),
    description: `literal "${words}"`,
    parents: [],
  });
}

class Literal extends Wordset {
  private derivation: WordDerivation;

  constructor(words: string) {
    super();
    this.derivation = literalDerivation(words);
  }

  _length(): Interval {
    return Interval.of(this.derivation.joined.length);
  }

  _plan(): PlanStep[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- intentional
  async *_run({ pattern }: RunArgs): AsyncIterable<WordDerivation | null> {
    yield this.derivation.ifMatches(pattern);
  }
}

class Values extends Wordset {
  private derivations: WordDerivation[];

  constructor(words: string[]) {
    super();
    this.derivations = words.map(
      (word) =>
        new WordDerivation({
          words: slugs(word),
          description: `given "${word}"`,
          parents: [],
        }),
    );
  }

  _length(): Interval {
    return Interval.join(
      this.derivations.map((derivation) =>
        Interval.of(derivation.joined.length),
      ),
    );
  }

  _plan(): PlanStep[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- intentional
  async *_run({ pattern }: RunArgs): AsyncIterable<WordDerivation | null> {
    for (const derivation of this.derivations) {
      yield derivation.ifMatches(pattern);
    }
  }
}

const LETTERS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

/** Strings of A–Z of length `n` that `pattern` allows letter by letter. */
function* letterStrings(n: number, pattern: Pattern): Generator<string> {
  const prefix: string[] = [];
  function* recurse(): Generator<string> {
    if (prefix.length === n) {
      yield prefix.join("");
      return;
    }
    for (const letter of LETTERS) {
      if (pattern.allows(prefix.length, letter)) {
        prefix.push(letter);
        yield* recurse();
        prefix.pop();
      }
    }
  }
  yield* recurse();
}

class Any extends Wordset {
  private lengths: Interval;

  constructor(length: Interval) {
    super();
    this.lengths = length.meet(Interval.nonnegative);
  }

  _length(): Interval {
    return this.lengths;
  }

  _plan(): PlanStep[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- intentional
  async *_run({
    pattern,
    candidates,
  }: RunArgs): AsyncIterable<WordDerivation | null> {
    const lengths = this.lengths.meet(pattern.length);
    const strings = candidates
      ? Array.from(candidates).filter(
          (candidate) =>
            lengths.min <= candidate.length &&
            candidate.length <= lengths.max &&
            /^[A-Z]*$/.test(candidate),
        )
      : Iter.flatMap(lengths, (n) => letterStrings(n, pattern));
    for (const string of strings) {
      yield new WordDerivation({
        words: [string],
        description: `any "${string}"`,
        parents: [],
      }).ifMatches(pattern);
    }
  }
}

/** Wordlist words, by length. Built lazily. */
let wordsByLength: Map<number, string[]> | null = null;

function wordlistWords(): Map<number, string[]> {
  if (wordsByLength === null) {
    wordsByLength = new Map();
    for (const slug of Object.keys(Wordset.cromulence.wordlist)) {
      const words = wordsByLength.get(slug.length) ?? [];
      words.push(slug.toUpperCase());
      wordsByLength.set(slug.length, words);
    }
  }
  return wordsByLength;
}

class Wordlist extends Wordset {
  _length(): Interval {
    return Interval.positive;
  }

  _plan(): PlanStep[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- intentional
  async *_run({
    pattern,
    candidates,
  }: RunArgs): AsyncIterable<WordDerivation | null> {
    const byLength = wordlistWords();
    const lengths = pattern.length.meet(
      Interval.of(1, Math.max(0, ...byLength.keys())),
    );
    for (const n of lengths) {
      const words = candidates
        ? Array.from(candidates).filter(
            (candidate) =>
              candidate.length === n &&
              candidate.toLowerCase() in Wordset.cromulence.wordlist,
          )
        : (byLength.get(n) ?? []);
      for (const word of words) {
        yield new WordDerivation({
          words: [word],
          description: `word "${word}"`,
          parents: [],
        }).ifMatches(pattern);
      }
    }
  }
}

/**
 * Normalize typographic punctuation in clue text, which is usually pasted
 * from a web page, to the ASCII that Datamuse and our lemmatizer expect.
 */
function normalizeClueText(text: string): string {
  return text
    .replaceAll(/[‘’‛′]/g, "'")
    .replaceAll(/[“”″]/g, '"')
    .replaceAll(/[‐‑‒–—]/g, "-");
}

/** The roman numeral for an integer like "1150", or null. */
function romanNumeral(text: string): string | null {
  if (!/^\s*\d+\s*$/.test(text)) {
    return null;
  }
  let n = parseInt(text, 10);
  if (n < 1 || n > 3999) {
    return null;
  }
  const values: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let numeral = "";
  for (const [value, letters] of values) {
    for (; n >= value; n -= value) {
      numeral += letters;
    }
  }
  return numeral;
}

/**
 * Query at most this many exact lengths separately; longer words share one
 * open-ended query.
 */
const MAX_EXACT_LENGTHS = 8;

class Synonym extends Wordset {
  private words: string;

  constructor(words: string) {
    super();
    this.words = words;
  }

  _length(): Interval {
    return Interval.positive;
  }

  /**
   * Datamuse returns at most 1000 results, ranked by relevance. A query over
   * a range of lengths (`sp=??*`) crowds out short words that a query for
   * one exact length (`sp=??`) would return, so we query the shortest
   * lengths exactly.
   */
  private spellings(pattern: Pattern): string[] {
    const lengths = pattern.length.meet(Interval.positive);
    if (lengths.isEmpty()) {
      return [];
    }
    const exact = lengths.meet(
      Interval.of(lengths.min, lengths.min + MAX_EXACT_LENGTHS - 1),
    );
    const spellings = Array.from(
      exact,
      (n) => pattern.prefixes(Interval.of(n)).oneLook,
    );
    if (lengths.max > exact.max) {
      spellings.push(`${"?".repeat(exact.max + 1)}*`);
    }
    return spellings;
  }

  /**
   * Datamuse mostly returns base forms: "birds" gives FALCON, not FALCONS. If
   * the definition is inflected, look up its base form and inflect the
   * results to match.
   */
  private async *inflected(
    text: string,
    pattern: Pattern,
    candidates: ReadonlySet<string> | undefined,
    unseen: (derivation: WordDerivation) => WordDerivation | null,
  ): AsyncIterable<WordDerivation | null> {
    const uninflected = uninflect(text);
    if (uninflected === null) {
      return;
    }

    // Inflecting adds at most this many letters: CHILD → CHILDREN.
    const growth = 4;
    const baseLengths = pattern.length
      .add(Interval.of(-growth, 0))
      .meet(Interval.positive);
    const responses = await Promise.all(
      this.spellings(Pattern.length(baseLengths)).map((spelledLike) =>
        datamuse({
          spelledLike,
          meansLike: uninflected.base,
          maxResults: 1000,
        }),
      ),
    );

    // Inflecting is slow, so skip base forms that can't match. Inflections
    // keep all but perhaps the last letter: SLEEP(y) → SLEEPIEST.
    const prefixes =
      candidates &&
      new Set(
        Array.from(candidates).flatMap((candidate) =>
          interval(0, candidate.length).map((n) => candidate.slice(0, n)),
        ),
      );
    for (const { word } of responses.flat()) {
      const stem = slugify(word).toUpperCase().slice(0, -1);
      if (
        !pattern.allows(0, word[0] ?? "") ||
        (prefixes && !prefixes.has(stem))
      ) {
        continue;
      }
      for (const form of inflect(word, uninflected.inflection)) {
        const derivation = new WordDerivation({
          words: [slugify(form).toUpperCase()],
          description: `synonym of "${this.words}" (${word.toUpperCase()}, ${uninflected.inflection})`,
          parents: [],
        }).ifMatches(pattern);
        yield derivation && unseen(derivation);
      }
    }
  }

  _plan(): PlanStep[] {
    return [];
  }

  async *_run({
    pattern,
    candidates,
  }: RunArgs): AsyncIterable<WordDerivation | null> {
    const seen = new Set<string>();
    const unseen = (derivation: WordDerivation): WordDerivation | null => {
      if (seen.has(derivation.joined)) {
        return null;
      }
      seen.add(derivation.joined);
      return derivation;
    };

    const literal = literalDerivation(this.words).ifMatches(pattern);
    yield literal && unseen(literal);

    const text = normalizeClueText(this.words);
    const responses = await Promise.all(
      this.spellings(pattern).map((spelledLike) =>
        datamuse({ spelledLike, meansLike: text, maxResults: 1000 }),
      ),
    );
    for (const result of responses.flat()) {
      const slug = slugify(result.word).toUpperCase();
      // Datamuse's single letters are noise ("zero" gives E, G, Q, ...);
      // single letters come from the abbreviation table instead.
      if (slug.length < 2) {
        continue;
      }
      const derivation = new WordDerivation({
        words: [slug],
        description: `synonym of "${this.words}"`,
        parents: [],
      }).ifMatches(pattern);
      yield derivation && unseen(derivation);
    }

    const numeral = romanNumeral(text);
    if (numeral !== null) {
      const derivation = new WordDerivation({
        words: [numeral],
        description: `roman numeral of "${this.words}"`,
        parents: [],
      }).ifMatches(pattern);
      yield derivation && unseen(derivation);
    }

    yield* this.inflected(text, pattern, candidates, unseen);

    // Look up the whole phrase ("South-East" is "southeast") and each word.
    const lemmas = new Set(lemmatize(text).map(({ lemma }) => lemma));
    const key = abbreviationKey(text);
    if (key !== undefined) {
      lemmas.add(key);
    }
    for (const lemma of lemmas) {
      for (const { abbreviation } of Wordset.abbreviations.get(lemma)) {
        const derivation = new WordDerivation({
          words: [slugify(abbreviation).toUpperCase()],
          description: `abbreviation of "${this.words}"`,
          parents: [],
        }).ifMatches(pattern);
        yield derivation && unseen(derivation);
      }
    }
  }
}

// cryptic-y transformations:

/**
 * The ways a per-word operation sees `item`: word by word and, for a phrase,
 * as one word. "Giant cave, almost" cuts the phrase, not each word.
 */
function wordings(item: WordDerivation): string[][] {
  return item.words.length > 1 ? [item.words, [item.joined]] : [item.words];
}

function renderMask(
  words: string[],
  survivors: Set<number>[],
  mode: "keep" | "delete",
): { words: string[]; description: string } {
  const descriptions = words.map((word, w) => {
    const keep = survivors[w]!;
    if (mode === "keep") {
      return Array.from(word)
        .map((letter, i) => (keep.has(i) ? letter : "_"))
        .join("")
        .replaceAll(/__+/g, "_");
    }
    return Array.from(word)
      .map((letter, i) => {
        const drop = !keep.has(i);
        return [
          drop && (i === 0 || keep.has(i - 1)) ? "(-" : "",
          drop ? letter.toLowerCase() : letter,
          drop && (i === word.length - 1 || keep.has(i + 1)) ? ")" : "",
        ].join("");
      })
      .join("");
  });

  return {
    words: descriptions.map((word) => word.replaceAll(/[^A-Z]/g, "")),
    description: descriptions.join(" "),
  };
}

class Alternate extends Wordset {
  private parent: Wordset;
  private offset: 0 | 1;

  constructor(parent: Wordset, offset: 0 | 1) {
    super();
    this.parent = parent;
    this.offset = offset;
  }

  _length(): Interval {
    const { min, max } = this.parent.length;
    // For a phrase of length n, offset 0 selects ceil(n/2) letters and offset 1
    // selects floor(n/2). The count is monotonic in n, so the bounds map
    // directly. (The naive ceil(min)..floor(max) is empty for odd lengths.)
    const count = (n: number) =>
      this.offset === 0 ? Math.ceil(n / 2) : Math.floor(n / 2);
    return Interval.of(count(min), count(max));
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      // Alternation runs across the whole phrase, not per word, so the letter
      // index keeps counting past spaces: "AbC dEfGh IjK", giving "ACEGIK".
      let index = 0;
      const rendered = item.words.map((word) =>
        Array.from(word)
          .map((letter) =>
            index++ % 2 === this.offset ? letter : letter.toLowerCase(),
          )
          .join(""),
      );
      const description = rendered.join(" ");
      yield new WordDerivation({
        words: [description.replaceAll(/[^A-Z]/g, "")],
        description,
        parents: [item],
      }).ifMatches(pattern);
    }
  }
}

function sortLetters(word: string): string {
  return Array.from(word).sort().join("");
}

class Anagram extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return this.parent.length;
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      { node: this.parent, args: { pattern: Pattern.from(pattern.length) } },
    ];
  }

  async *_run(
    { pattern, candidates }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    // Checking candidates is far cheaper than enumerating the n! anagrams of
    // long fodder.
    const byLetters = new Map<string, string[]>();
    for (const candidate of candidates ?? []) {
      if (pattern.test(candidate)) {
        const key = sortLetters(candidate);
        byLetters.set(key, [...(byLetters.get(key) ?? []), candidate]);
      }
    }

    for await (const parent of runChild(this.parent)) {
      const found = candidates
        ? (byLetters.get(sortLetters(parent.joined)) ?? [])
        : anagrams(parent.joined, (index, letter) =>
            pattern.allows(index, letter),
          );
      for (const anagram of found) {
        yield new WordDerivation({
          description: `${anagram}*`,
          parents: [parent],
        }).ifMatches(pattern);
      }
    }
  }
}

class Centers extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.of(1, Math.max(1, this.parent.length.max - 2));
  }

  private *runs(n: number): Generator<Set<number>> {
    for (let k = 1; n - 1 - k >= k; k++) {
      yield new Set(interval(k, n - 1 - k));
    }
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      for (const words of wordings(item)) {
        const perWord = words.map((word) => [...this.runs(word.length)]);
        if (perWord.some((runs) => runs.length === 0)) {
          continue;
        }
        for (const survivors of Iter.product(...perWord)) {
          yield new WordDerivation({
            ...renderMask(words, survivors, "keep"),
            parents: [item],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

class Concat extends Wordset {
  private left: Wordset;
  private right: Wordset;

  constructor(left: Wordset, right: Wordset) {
    super();
    this.left = left;
    this.right = right;
  }

  _length(): Interval {
    return this.left.length.add(this.right.length);
  }

  _plan({ pattern, candidates }: RunArgs): PlanStep[] {
    const leftLength = this.left.length.meet(
      pattern.length.sub(this.right.length),
    );
    const rightLength = this.right.length.meet(
      pattern.length.sub(this.left.length),
    );

    const leftPattern =
      leftLength.isEmpty() || leftLength.max === Infinity
        ? leftLength
        : pattern.prefixes(leftLength);
    const rightPattern =
      rightLength.isEmpty() || rightLength.max === Infinity
        ? rightLength
        : pattern.reverse().prefixes(rightLength).reverse();

    // Each candidate splits into a left prefix and a right suffix.
    let leftCandidates: Set<string> | undefined;
    let rightCandidates: Set<string> | undefined;
    if (candidates) {
      leftCandidates = new Set();
      rightCandidates = new Set();
      for (const candidate of candidates) {
        for (const k of interval(0, candidate.length)) {
          leftCandidates.add(candidate.slice(0, k));
          rightCandidates.add(candidate.slice(k));
        }
      }
    }

    return [
      {
        node: this.left,
        args: {
          pattern: Pattern.from(leftPattern),
          candidates: leftCandidates,
        },
      },
      {
        node: this.right,
        args: {
          pattern: Pattern.from(rightPattern),
          candidates: rightCandidates,
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const [left, right] of AsyncIter.product(
      runChild(this.left),
      runChild(this.right),
    )) {
      yield new WordDerivation({
        words: [...left.words, ...right.words],
        description: `${left}+${right}`,
        parents: [left, right],
      }).ifMatches(pattern);
    }
  }
}

class Delete extends Wordset {
  private whole: Wordset;
  private part: Wordset;

  constructor(whole: Wordset, part: Wordset) {
    super();
    this.whole = whole;
    this.part = part;
  }

  _length(): Interval {
    return this.whole.length.sub(this.part.length).meet(Interval.positive);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.whole,
        args: {
          pattern: Pattern.from(
            this.whole.length.meet(pattern.length.add(this.part.length)),
          ),
        },
      },
      {
        node: this.part,
        args: {
          pattern: Pattern.from(
            this.part.length.meet(this.whole.length.sub(pattern.length)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const [whole, part] of AsyncIter.product(
      runChild(this.whole),
      runChild(this.part),
    )) {
      if (whole.joined.length <= part.joined.length) {
        continue;
      }

      for (const indices of subsequences(whole.joined, part.joined)) {
        yield new WordDerivation({
          description: whole.mapString((letter, i) => [
            indices.has(i) && !indices.has(i - 1) ? "(-" : "",
            indices.has(i) ? letter.toLowerCase() : letter,
            indices.has(i) && !indices.has(i + 1) ? ")" : "",
          ]),
          parents: [whole, part],
        }).ifMatches(pattern);
      }
    }
  }
}

class DeleteAll extends Wordset {
  private whole: Wordset;
  private part: Wordset;

  constructor(whole: Wordset, part: Wordset) {
    super();
    this.whole = whole;
    this.part = part;
  }

  _length(): Interval {
    return Interval.of(0, this.whole.length.sub(this.part.length).max);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.whole,
        args: {
          pattern: Pattern.from(
            Interval.of(
              pattern.length.add(this.part.length).min,
              this.whole.length.max,
            ),
          ),
        },
      },
      {
        node: this.part,
        args: {
          pattern: Pattern.from(this.part.length.meet(Interval.positive)),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const [whole, part] of AsyncIter.product(
      runChild(this.whole),
      runChild(this.part),
    )) {
      const splits = whole.joined.split(part.joined);
      if (splits.length === 1) {
        continue;
      }

      const indices = new Set(
        splits.slice(0, -1).reduce<number[]>((acc, split) => {
          const base = (acc.at(-1) ?? -1) + 1 + split.length;
          return [...acc, ...interval(base, base + part.joined.length - 1)];
        }, []),
      );

      yield new WordDerivation({
        description: whole.mapString((letter, i) => [
          indices.has(i) && !indices.has(i - 1) ? "(-" : "",
          indices.has(i) ? letter.toLowerCase() : letter,
          indices.has(i) && !indices.has(i + 1) ? ")" : "",
        ]),
        parents: [whole, part],
      }).ifMatches(pattern);
    }
  }
}

/**
 * How many letters a homophone's spelling may differ in length from the
 * original: WHET/WET, QUAY/KEY.
 */
const HOMOPHONE_SLACK = 2;

class Homophone extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.positive;
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    // Each parent costs a Datamuse query, so only run parents that could
    // plausibly sound like a match.
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length
              .meet(
                pattern.length.add(
                  Interval.of(-HOMOPHONE_SLACK, HOMOPHONE_SLACK),
                ),
              )
              .meet(Interval.positive),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      const phrase = item.words.join(" ");
      const results = await datamuse({ soundsLike: phrase });
      for (const result of results) {
        yield new WordDerivation({
          words: [slugify(result.word).toUpperCase()],
          description: `${result.word.toUpperCase()} "${phrase}"`,
          parents: [item],
        }).ifMatches(pattern);
      }
    }
  }
}

class Insert extends Wordset {
  private container: Wordset;
  private content: Wordset;

  constructor(container: Wordset, content: Wordset) {
    super();
    this.container = container;
    this.content = content;
  }

  _length(): Interval {
    return this.container.length.add(this.content.length);
  }

  _plan({ pattern, candidates }: RunArgs): PlanStep[] {
    // Each candidate splits into content strictly inside it, and the
    // container around that.
    let containerCandidates: Set<string> | undefined;
    let contentCandidates: Set<string> | undefined;
    if (candidates) {
      containerCandidates = new Set();
      contentCandidates = new Set();
      for (const candidate of candidates) {
        for (const i of interval(1, candidate.length - 1)) {
          for (const j of interval(i, candidate.length - 1)) {
            containerCandidates.add(candidate.slice(0, i) + candidate.slice(j));
            contentCandidates.add(candidate.slice(i, j));
          }
        }
      }
    }

    return [
      {
        node: this.container,
        args: {
          pattern: Pattern.from(
            this.container.length.meet(pattern.length.sub(this.content.length)),
          ),
          candidates: containerCandidates,
        },
      },
      {
        node: this.content,
        args: {
          pattern: Pattern.from(
            this.content.length.meet(pattern.length.sub(this.container.length)),
          ),
          candidates: contentCandidates,
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const [container, content] of AsyncIter.product(
      runChild(this.container),
      runChild(this.content),
    )) {
      for (const i of interval(1, container.joined.length - 1)) {
        yield new WordDerivation({
          description: container.mapString((letter, j) => [
            j === i ? `(${content})` : "",
            letter,
          ]),
          parents: [container, content],
        }).ifMatches(pattern);
      }
    }
  }
}

class MoveLetter extends Wordset {
  private parent: Wordset;
  private moves: "any" | "ends";

  constructor(parent: Wordset, moves: "any" | "ends") {
    super();
    this.parent = parent;
    this.moves = moves;
  }

  _length(): Interval {
    return this.parent.length;
  }

  private *targets(n: number): Generator<[number, number]> {
    if (this.moves === "ends") {
      yield [0, n - 1];
      yield [n - 1, 0];
      return;
    }
    for (const from of interval(0, n - 1)) {
      for (const to of interval(0, n - 1)) {
        if (from !== to) {
          yield [from, to];
        }
      }
    }
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      { node: this.parent, args: { pattern: Pattern.from(pattern.length) } },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      const letters = Array.from(item.joined);
      const seen = new Set<string>([item.joined]);
      for (const [from, to] of this.targets(letters.length)) {
        const moved = [...letters];
        const [letter] = moved.splice(from, 1);
        moved.splice(to, 0, letter!);
        const result = moved.join("");
        if (seen.has(result)) {
          continue;
        }
        seen.add(result);
        yield new WordDerivation({
          words: [result],
          description: `${result} (${letter!.toLowerCase()} moved)`,
          parents: [item],
        }).ifMatches(pattern);
      }
    }
  }
}

class Overlap extends Wordset {
  private left: Wordset;
  private right: Wordset;

  constructor(left: Wordset, right: Wordset) {
    super();
    this.left = left;
    this.right = right;
  }

  _length(): Interval {
    // Sharing k letters, where 1 <= k < min(|left|, |right|).
    const { left, right } = this;
    return Interval.of(
      Math.max(left.length.min, right.length.min, 2) + 1,
      left.length.max + right.length.max - 1,
    );
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    // Each side is a proper prefix or suffix of the result.
    const sideLength = Interval.of(2, pattern.length.max - 1);
    const leftLength = this.left.length.meet(sideLength);
    const rightLength = this.right.length.meet(sideLength);

    const leftPattern =
      leftLength.isEmpty() || leftLength.max === Infinity
        ? leftLength
        : pattern.prefixes(leftLength);
    const rightPattern =
      rightLength.isEmpty() || rightLength.max === Infinity
        ? rightLength
        : pattern.reverse().prefixes(rightLength).reverse();

    return [
      { node: this.left, args: { pattern: Pattern.from(leftPattern) } },
      { node: this.right, args: { pattern: Pattern.from(rightPattern) } },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const [left, right] of AsyncIter.product(
      runChild(this.left),
      runChild(this.right),
    )) {
      const [l, r] = [left.joined, right.joined];
      for (const k of interval(1, Math.min(l.length, r.length) - 1)) {
        if (l.endsWith(r.slice(0, k))) {
          yield new WordDerivation({
            words: [l + r.slice(k)],
            description: `${left}+${right} (${r.slice(0, k).toLowerCase()} shared)`,
            parents: [left, right],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

class Remove extends Wordset {
  private parent: Wordset;
  private indices: number[];

  constructor(parent: Wordset, indices: number[]) {
    super();
    this.parent = parent;
    this.indices = indices;
  }

  _length(): Interval {
    return Interval.of(0, this.parent.length.max);
  }

  private survives(word: string, i: number): boolean {
    return !this.indices.includes(i) && !this.indices.includes(i - word.length);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      for (const words of wordings(item)) {
        const valid = words.every((word) =>
          this.indices.every((idx) =>
            idx >= 0 ? word.length > idx : word.length >= -idx,
          ),
        );

        if (!valid) {
          continue;
        }

        const survivors = words.map(
          (word) =>
            new Set(
              interval(0, word.length - 1).filter((i) =>
                this.survives(word, i),
              ),
            ),
        );

        yield new WordDerivation({
          ...renderMask(words, survivors, "delete"),
          parents: [item],
        }).ifMatches(pattern);
      }
    }
  }
}

type Replacement = { words: string[]; description: string };

/**
 * Replace each single occurrence of `from` in `whole` with `to`, one result
 * per occurrence.
 */
function* replaceEach(
  whole: WordDerivation,
  from: string,
  to: WordDerivation,
): Generator<Replacement> {
  for (const [w, word] of whole.words.entries()) {
    for (let i = word.indexOf(from); i >= 0; i = word.indexOf(from, i + 1)) {
      const replaced = `${word.slice(0, i)}${to.joined}${word.slice(i + from.length)}`;
      const described = `${word.slice(0, i)}(${from.toLowerCase()}→${to})${word.slice(i + from.length)}`;
      yield {
        words: whole.words.map((other, v) => (v === w ? replaced : other)),
        description: whole.words
          .map((other, v) => (v === w ? described : other))
          .join(" "),
      };
    }
  }
}

/**
 * Replace per-word non-overlapping occurrences of `from` in `whole` with `to`,
 * if there are any.
 */
function* replaceAllOccurrences(
  whole: WordDerivation,
  from: string,
  to: WordDerivation,
): Generator<Replacement> {
  const words: string[] = [];
  const descriptions: string[] = [];
  let count = 0;

  for (const word of whole.words) {
    let description = "";
    let out = "";
    for (let i = 0; i < word.length;) {
      if (word.startsWith(from, i)) {
        description += `(${from.toLowerCase()}→${to})`;
        out += to.joined;
        i += from.length;
        count += 1;
      } else {
        description += word[i]!;
        out += word[i]!;
        i += 1;
      }
    }
    words.push(out);
    descriptions.push(description);
  }

  if (count > 0) {
    yield { words, description: descriptions.join(" ") };
  }
}

/** Replace `from` in `whole` with `to`, in the ways `replacements` gives. */
async function* replaceRun(
  wholes: AsyncIterable<WordDerivation>,
  froms: AsyncIterable<WordDerivation>,
  tos: AsyncIterable<WordDerivation>,
  pattern: Pattern,
  replacements: (
    whole: WordDerivation,
    from: string,
    to: WordDerivation,
  ) => Iterable<Replacement>,
): AsyncIterable<WordDerivation | null> {
  const ws = await AsyncIter.toArray(wholes);
  const fs = await AsyncIter.toArray(froms);
  const ts = await AsyncIter.toArray(tos);

  for (const w of ws) {
    for (const f of fs) {
      if (f.joined.length === 0) {
        continue;
      }
      for (const t of ts) {
        for (const { words, description } of replacements(w, f.joined, t)) {
          yield new WordDerivation({
            words,
            description,
            parents: [w, f, t],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

class Replace extends Wordset {
  private whole: Wordset;
  private from: Wordset;
  private to: Wordset;

  constructor(whole: Wordset, from: Wordset, to: Wordset) {
    super();
    this.whole = whole;
    this.from = from;
    this.to = to;
  }

  _length(): Interval {
    return this.whole.length
      .sub(this.from.length)
      .add(this.to.length)
      .meet(Interval.nonnegative);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    // One replacement: |result| = |whole| - |from| + |to|.
    const [W, F, T, P] = [
      this.whole.length,
      this.from.length,
      this.to.length,
      pattern.length,
    ];
    return [
      {
        node: this.whole,
        args: { pattern: Pattern.from(W.meet(P.sub(T).add(F))) },
      },
      {
        node: this.from,
        args: {
          pattern: Pattern.from(
            F.meet(W.sub(P).add(T))
              .meet(Interval.of(0, W.max))
              .meet(Interval.positive),
          ),
        },
      },
      {
        node: this.to,
        args: { pattern: Pattern.from(T.meet(P.sub(W).add(F))) },
      },
    ];
  }

  _run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    return replaceRun(
      runChild(this.whole),
      runChild(this.from),
      runChild(this.to),
      pattern,
      replaceEach,
    );
  }
}

class ReplaceAll extends Wordset {
  private whole: Wordset;
  private from: Wordset;
  private to: Wordset;

  constructor(whole: Wordset, from: Wordset, to: Wordset) {
    super();
    this.whole = whole;
    this.from = from;
    this.to = to;
  }

  _length(): Interval {
    const W = this.whole.length;
    const T = this.to.length;

    const fMin = Math.max(1, this.from.length.min);
    const fMax = Math.max(1, this.from.length.max);

    const kMax = W.max === Infinity ? Infinity : Math.floor(W.max / fMin);
    const growth = T.max - fMin;
    const max = W.max + (growth > 0 ? kMax * growth : 0);

    const wMin = Math.max(1, W.min);
    const fFit = Math.min(fMax, wMin);
    const shrink = T.min - fFit;
    const min = wMin + Math.min(Math.floor(wMin / fFit) * shrink, shrink);

    return Interval.of(min, max).meet(Interval.nonnegative);
  }

  _plan(): PlanStep[] {
    return [
      { node: this.whole, args: { pattern: Pattern.from(this.whole.length) } },
      {
        node: this.from,
        args: {
          pattern: Pattern.from(
            this.from.length
              .meet(Interval.of(0, this.whole.length.max))
              .meet(Interval.positive),
          ),
        },
      },
      { node: this.to, args: { pattern: Pattern.from(this.to.length) } },
    ];
  }

  _run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    return replaceRun(
      runChild(this.whole),
      runChild(this.from),
      runChild(this.to),
      pattern,
      replaceAllOccurrences,
    );
  }
}

class ReplaceAt extends Wordset {
  private parent: Wordset;
  private indices: number[];
  private to: Wordset;

  constructor(parent: Wordset, indices: number[], to: Wordset) {
    super();
    this.parent = parent;
    this.indices = indices;
    this.to = to;
  }

  _length(): Interval {
    const W = this.parent.length;
    const T = this.to.length;
    if (this.indices.length === 0) {
      return W;
    }

    const max =
      T.max >= 1
        ? W.max === Infinity || T.max === Infinity
          ? Infinity
          : W.max * T.max
        : W.max - 1;
    const min = T.min >= 1 ? W.min + (T.min - 1) : 0;

    return Interval.of(min, max).meet(Interval.nonnegative);
  }

  _plan(): PlanStep[] {
    // TODO: push down lengths; this runs both sides unconstrained.
    return [
      { node: this.parent, args: { pattern: Pattern.any } },
      { node: this.to, args: { pattern: Pattern.any } },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    const items = await AsyncIter.toArray(runChild(this.parent));
    const tos = await AsyncIter.toArray(runChild(this.to));

    for (const to of tos) {
      for (const item of items) {
        for (const itemWords of wordings(item)) {
          const valid = itemWords.every((word) =>
            this.indices.every((idx) =>
              idx >= 0 ? word.length > idx : word.length >= -idx,
            ),
          );
          if (!valid) {
            continue;
          }

          const words: string[] = [];
          const descriptions: string[] = [];
          for (const word of itemWords) {
            const selected = new Set(
              interval(0, word.length - 1).filter(
                (i) =>
                  this.indices.includes(i) ||
                  this.indices.includes(i - word.length),
              ),
            );
            let description = "";
            let out = "";
            for (let i = 0; i < word.length; i++) {
              if (selected.has(i)) {
                description += `(${word[i]!.toLowerCase()}→${to})`;
                out += to.joined;
              } else {
                description += word[i]!;
                out += word[i]!;
              }
            }
            words.push(out);
            descriptions.push(description);
          }

          yield new WordDerivation({
            words,
            description: descriptions.join(" "),
            parents: [item, to],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

class Reverse extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return this.parent.length;
  }

  _plan({ pattern, candidates }: RunArgs): PlanStep[] {
    const reversedCandidates =
      candidates &&
      new Set(
        Array.from(candidates, (candidate) =>
          Array.from(candidate).reverse().join(""),
        ),
      );
    return [
      {
        node: this.parent,
        args: { pattern: pattern.reverse(), candidates: reversedCandidates },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      const reversed = Array.from(item.joined);
      yield new WordDerivation({
        description: `${item.mapString(() => [reversed.pop()!])}<`,
        parents: [item],
      }).ifMatches(pattern);
    }
  }
}

class Select extends Wordset {
  private parent: Wordset;
  private indices: number[];

  constructor(parent: Wordset, indices: number[]) {
    super();
    this.parent = parent;
    this.indices = indices;
  }

  _length(): Interval {
    const positive = new Set(this.indices.filter((idx) => idx >= 0)).size;
    const negative = new Set(this.indices.filter((idx) => idx < 0)).size;
    return Interval.of(Math.max(positive, negative), this.parent.length.max);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      for (const words of wordings(item)) {
        const valid = words.every((word) =>
          this.indices.every((idx) =>
            idx >= 0 ? word.length > idx : word.length >= -idx,
          ),
        );

        if (!valid) {
          continue;
        }

        const survivors = words.map(
          (word) =>
            new Set(
              interval(0, word.length - 1).filter(
                (i) =>
                  this.indices.includes(i) ||
                  this.indices.includes(i - word.length),
              ),
            ),
        );

        yield new WordDerivation({
          ...renderMask(words, survivors, "keep"),
          parents: [item],
        }).ifMatches(pattern);
      }
    }
  }
}

type Side = "reach" | "stop";

/**
 * Slice each word. For each side of the slice, specify whether to reach that
 * end of the word or stop before. Also specify whether to keep or delete slice.
 */
class Slice extends Wordset {
  private parent: Wordset;
  private left: Side;
  private right: Side;
  private mode: "keep" | "delete";

  constructor(
    parent: Wordset,
    left: Side,
    right: Side,
    mode: "keep" | "delete",
  ) {
    super();
    this.parent = parent;
    this.left = left;
    this.right = right;
    this.mode = mode;
  }

  _length(): Interval {
    const min =
      this.mode === "delete" && this.left === "stop" && this.right === "stop"
        ? 2
        : 1;
    return Interval.of(min, Math.max(min, this.parent.length.max - 1));
  }

  private *runs(n: number): Generator<Set<number>> {
    const starts = this.left === "reach" ? [0] : interval(1, n - 1);
    const ends = this.right === "reach" ? [n - 1] : interval(n - 2, 0, -1);
    const all: Set<number>[] = [];
    for (const start of starts) {
      for (const end of ends) {
        if (start > end) {
          continue;
        }
        const run = new Set(interval(start, end));
        const survivors =
          this.mode === "keep"
            ? run
            : new Set(interval(0, n - 1).filter((i) => !run.has(i)));
        if (survivors.size > 0) {
          all.push(survivors);
        }
      }
    }
    // In delete mode the run is what's removed, so iterating the run
    // smallest-first yields the *largest* deletion first. Reverse so the
    // largest survivor comes first, matching keep mode (THI_ before T_).
    if (this.mode === "delete") {
      all.reverse();
    }
    yield* all;
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      for (const words of wordings(item)) {
        const perWord = words.map((word) => [...this.runs(word.length)]);
        if (perWord.some((runs) => runs.length === 0)) {
          continue;
        }
        for (const survivors of Iter.product(...perWord)) {
          yield new WordDerivation({
            ...renderMask(words, survivors, this.mode),
            parents: [item],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

/** The leading consonants of a word: SH in SHOE, B in BOAT. */
function onset(word: string): string {
  return /^[^AEIOU]*/.exec(word)![0];
}

class Spoonerism extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return this.parent.length;
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      { node: this.parent, args: { pattern: Pattern.from(pattern.length) } },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      const { words } = item;
      const seen = new Set<string>();
      for (const i of interval(0, words.length - 1)) {
        for (const j of interval(i + 1, words.length - 1)) {
          const [a, b] = [words[i]!, words[j]!];
          // Swap the leading consonants, or failing that the first letters.
          for (const [x, y] of [
            [onset(a), onset(b)],
            [a.slice(0, 1), b.slice(0, 1)],
          ] as const) {
            if (x === y || x.length === 0 || y.length === 0) {
              continue;
            }
            const swapped = words.map((word, w) =>
              w === i
                ? y + a.slice(x.length)
                : w === j
                  ? x + b.slice(y.length)
                  : word,
            );
            const key = swapped.join(" ");
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            yield new WordDerivation({
              words: swapped,
              description: `${key} (spoonerism of ${words.join(" ")})`,
              parents: [item],
            }).ifMatches(pattern);
          }
        }
      }
    }
  }
}

class Substring extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.of(1, this.parent.length.max);
  }

  _plan({ pattern }: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: Pattern.from(
            this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
          ),
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      const full = item.words.join("");

      // We need to preserve spacing: the substring of "bath island" is
      // "_TH IS_", not "_THIS_". (Prefix and suffix indicators don't tend to
      // be multi-word, so we don't do the same thing for those.)
      const spaces = item.words.reduce<number[]>(
        (acc, word) => [...acc, (acc.at(-1) ?? 0) + word.length],
        [],
      );

      for (const start of interval(0, full.length - 1)) {
        for (const end of interval(start, full.length - 1)) {
          const descriptions = [
            start > 0 ? "_" : "",
            ...interval(start, end).flatMap((i) => [
              spaces.includes(i) && i !== start ? " " : "",
              full[i]!,
            ]),
            end < full.length ? "_" : "",
          ].join("");

          yield new WordDerivation({
            words: [descriptions.replaceAll(/[^A-Z]/g, "")],
            description: descriptions,
            parents: [item],
          }).ifMatches(pattern);
        }
      }
    }
  }
}
// non-cryptic-y transformations:

class Intersect extends Wordset {
  private left: Wordset;
  private right: Wordset;

  constructor(left: Wordset, right: Wordset) {
    super();
    this.left = left;
    this.right = right;
  }

  _length(): Interval {
    return this.left.length.meet(this.right.length);
  }

  /**
   * Materializes left, then runs right with left's results as candidates. So
   * left should be the smaller side, usually the definition: many operations
   * can check a candidate far faster than they can enumerate.
   */
  _plan(args: RunArgs): PlanStep[] {
    // At run time, right is also narrowed to left's results.
    return [
      { node: this.left, args },
      { node: this.right, args: { pattern: args.pattern } },
    ];
  }

  async *_run(
    _args: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    const lefts = await AsyncIter.toArray(runChild(this.left));

    if (lefts.length === 0) {
      return;
    }

    const rights = new Map<string, WordDerivation>();
    for await (const item of runChild(this.right, {
      candidates: new Set(lefts.map((item) => item.joined)),
    })) {
      if (!rights.has(item.joined)) {
        rights.set(item.joined, item);
      }
    }

    for (const item of lefts) {
      const other = rights.get(item.joined);
      if (other) {
        yield new WordDerivation({
          words: item.words,
          description: `${item.description} = ${other.description}`,
          parents: [item, other],
        });
      }
    }
  }
}

class Union extends Wordset {
  private left: Wordset;
  private right: Wordset;

  constructor(left: Wordset, right: Wordset) {
    super();
    this.left = left;
    this.right = right;
  }

  _length(): Interval {
    return this.left.length.join(this.right.length);
  }

  _plan(args: RunArgs): PlanStep[] {
    return [
      { node: this.left, args },
      { node: this.right, args },
    ];
  }

  async *_run(
    _args: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    yield* runChild(this.left);
    yield* runChild(this.right);
  }
}

class Wordlike extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return this.parent.length;
  }

  _plan(args: RunArgs): PlanStep[] {
    return [{ node: this.parent, args }];
  }

  async *_run(
    _args: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      if (Wordset.cromulence.cromulence(item.joined) >= 0) {
        yield item;
      }
    }
  }
}

class Match extends Wordset {
  private parent: Wordset;
  private pattern: Pattern;

  constructor(parent: Wordset, pattern: Pattern) {
    super();
    this.parent = parent;
    this.pattern = pattern;
  }

  _length(): Interval {
    return this.parent.length.meet(this.pattern.length);
  }

  _plan(args: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: args.pattern.meet(this.pattern),
          candidates: args.candidates,
        },
      },
    ];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      // Meet approximates, so check both patterns.
      yield item.ifMatches(pattern) && item.ifMatches(this.pattern);
    }
  }
}

class Exclude extends Wordset {
  private parent: Wordset;
  private excluded: ReadonlySet<string>;

  constructor(parent: Wordset, words: string[]) {
    super();
    this.parent = parent;
    this.excluded = new Set(words.map((word) => slugs(word).join("")));
  }

  _length(): Interval {
    return this.parent.length;
  }

  _plan(args: RunArgs): PlanStep[] {
    return [
      {
        node: this.parent,
        args: {
          pattern: args.pattern,
          candidates: args.candidates?.difference(this.excluded),
        },
      },
    ];
  }

  async *_run(
    _args: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      yield this.excluded.has(item.joined) ? null : item;
    }
  }
}

class FlatMap extends Wordset {
  private parent: Wordset;
  private fn: (words: string[]) => Iterable<string>;
  private name: string;

  constructor(
    parent: Wordset,
    fn: (words: string[]) => Iterable<string>,
    name: string,
  ) {
    super();
    this.parent = parent;
    this.fn = fn;
    this.name = name;
  }

  _length(): Interval {
    return Interval.nonnegative;
  }

  _plan(): PlanStep[] {
    return [{ node: this.parent, args: { pattern: Pattern.any } }];
  }

  async *_run(
    { pattern }: RunArgs,
    runChild: RunChild,
  ): AsyncIterable<WordDerivation | null> {
    for await (const item of runChild(this.parent)) {
      for (const output of this.fn(item.words)) {
        const words = slugs(output);
        yield new WordDerivation({
          words,
          description: `${words.join(" ")} (${this.name} of ${item})`,
          parents: [item],
        }).ifMatches(pattern);
      }
    }
  }
}
