import { Cromulence, slugify } from "cromulence";
import { Abbreviations } from "./abbreviations.js";
import * as AsyncIter from "./asyncIterable.js";
import { datamuse } from "./datamuse.js";
import { lemmatize } from "./nlp.js";
import { Pattern } from "./pattern.js";
import { anagrams, Interval, interval, subsequences } from "./util.js";

/** A string of "words" and how they were produced. */
class WordDerivation {
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
}

export type WordsetData = {
  wordlist: Record<string, number>;
  abbreviations: string[];
};

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
  }

  /** Possible `joined` lengths of results. */
  abstract _length(): Interval;

  /**
   * Yield WordDerivations (or null) matching the wordset filters and the
   * given pattern.
   */
  abstract _run(pattern: Pattern): AsyncIterable<WordDerivation | null>;

  #length: Interval | null = null;

  /** Possible `joined` lengths of results. */
  get length(): Interval {
    return (this.#length ??= this._length());
  }

  private hasRun = false;

  /**
   * Yield WordDerivations matching the wordset filters and the given regex.
   * Single-use.
   */
  async *run(
    input?: RegExp | Pattern | Interval,
  ): AsyncIterable<WordDerivation> {
    if (this.hasRun) {
      throw new Error("Wordset.run may only be called once");
    }
    this.hasRun = true;

    if (input instanceof Interval && input.isEmpty()) {
      return;
    }

    const pattern =
      input === undefined
        ? Pattern.any
        : input instanceof Interval
          ? Pattern.length(input)
          : input instanceof Pattern
            ? input
            : Pattern.parse(input);

    if (pattern.length.isEmpty()) {
      return;
    }

    for await (const item of this._run(pattern)) {
      if (item !== null) {
        yield item;
      }
    }
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

  // cryptic-y transformations:

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
   * Center letters of this: _HI_.
   *
   * Not a special case of substring, because this maps per-word.
   */
  // TODO: implement
  // centers(): Wordset {
  //   return new Centers(this);
  // }

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
   * Delete the *subsequence* other from this: TH(-other)IS.
   *
   * Compare with deleteAll, which removes all instances at once.
   * Compare with remove, which takes indices, rather than letters.
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
   * Delete some (strictly) middle substring of this: T(-hi)S.
   */
  ends(): Wordset {
    return new Ends(this);
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
   * Prefix of this: TH_.
   *
   * Not a special case of substring, because this maps per-word.
   */
  prefix(): Wordset {
    return new Prefix(this);
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
   * Reverse this: SIHT<.
   *
   * Technically a special case of anagrams. But unlike anagrams, it's usually
   * fine to reverse a wordset with more than one item.
   */
  reverse(): Wordset {
    return new Reverse(this);
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
   * Substring of this: _HI_.
   *
   * This is called "hidden word" in cryptic clues.
   */
  substring(): Wordset {
    return new Substring(this);
  }

  /**
   * Suffix of this: _IS.
   *
   * Not a special case of substring, because this maps per-word.
   */
  suffix(): Wordset {
    return new Suffix(this);
  }

  // non-cryptic-y transformations:

  /**
   * Intersect this and other: THIS = OTHER.
   *
   * We ignore spacing when intersecting.
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

class Literal extends Wordset {
  private derivation: WordDerivation;

  constructor(words: string) {
    super();
    const slugs = words
      .split(" ")
      .map((word) => slugify(word).toUpperCase())
      .filter((slug) => slug.length > 0);
    this.derivation = new WordDerivation({
      words: slugs,
      description: `literal "${words}"`,
      parents: [],
    });
  }

  _length(): Interval {
    return Interval.of(this.derivation.joined.length);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- intentional
  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    yield this.derivation.ifMatches(pattern);
  }
}

class Synonym extends Wordset {
  private words: string;

  constructor(words: string) {
    super();
    this.words = words;
  }

  _length(): Interval {
    return Interval.positive;
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    yield* Wordset.literal(this.words).run(pattern);

    const oneLook = await datamuse({
      spelledLike: pattern.oneLook,
      meansLike: this.words,
      maxResults: 1000,
    });
    for (const result of oneLook) {
      yield new WordDerivation({
        words: [slugify(result.word).toUpperCase()],
        description: `synonym of "${this.words}"`,
        parents: [],
      }).ifMatches(pattern);
    }

    for (const { lemma } of lemmatize(this.words)) {
      for (const { abbreviation } of Wordset.abbreviations.get(lemma)) {
        yield new WordDerivation({
          words: [slugify(abbreviation).toUpperCase()],
          description: `abbreviation of "${this.words}"`,
          parents: [],
        }).ifMatches(pattern);
      }
    }
  }
}

// cryptic-y transformations:

class Anagram extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return this.parent.length;
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const parent of this.parent.run(pattern.length)) {
      for (const anagram of anagrams(parent.joined)) {
        yield new WordDerivation({
          description: `${anagram}*`,
          parents: [parent],
        }).ifMatches(pattern);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
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

    for await (const [left, right] of AsyncIter.product(
      this.left.run(leftPattern),
      this.right.run(rightPattern),
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const [whole, part] of AsyncIter.product(
      this.whole.run(
        this.whole.length.meet(pattern.length.add(this.part.length)),
      ),
      this.part.run(
        this.part.length.meet(this.whole.length.sub(pattern.length)),
      ),
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const [whole, part] of AsyncIter.product(
      this.whole.run(
        Interval.of(
          pattern.length.add(this.part.length).min,
          this.whole.length.max,
        ),
      ),
      this.part.run(this.part.length.meet(Interval.positive)),
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

class Ends extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.of(2, Math.max(2, this.parent.length.max - 1));
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(
      this.parent.length.meet(Interval.of(pattern.length.min + 1, Infinity)),
    )) {
      for (const start of interval(1, item.joined.length - 2)) {
        for (const end of interval(start + 1, item.joined.length - 1)) {
          yield new WordDerivation({
            description: item.mapString((letter, i) => [
              i === start ? "(-" : "",
              start <= i && i < end ? letter.toLowerCase() : letter,
              i === end - 1 ? ")" : "",
            ]),
            parents: [item],
          }).ifMatches(pattern);
        }
      }
    }
  }
}

class Homophone extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.positive;
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run()) {
      const phrase = item.words.join(" ");
      const results = await datamuse({ soundsLike: phrase });
      for (const result of results) {
        yield new WordDerivation({
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const [container, content] of AsyncIter.product(
      this.container.run(
        this.container.length.meet(pattern.length.sub(this.content.length)),
      ),
      this.content.run(
        this.content.length.meet(pattern.length.sub(this.container.length)),
      ),
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

class Prefix extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.of(1, Math.max(1, this.parent.length.max - 1));
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(
      this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
    )) {
      for (const i of interval(item.joined.length - 1, 1, -1)) {
        yield new WordDerivation({
          description: item.mapString((letter, j) => [
            j === i ? "_" : "",
            j < i ? letter : "",
          ]),
          parents: [item],
        }).ifMatches(pattern);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run()) {
      const valid = item.words.every((word) =>
        this.indices.every((idx) =>
          idx >= 0 ? word.length > idx : word.length >= -idx,
        ),
      );

      if (!valid) {
        continue;
      }

      const descriptions = item.words.map((word) =>
        Array.from(word)
          .map((letter, i) =>
            this.indices.includes(i) || this.indices.includes(i - word.length)
              ? `(-${letter.toLowerCase()})`
              : letter,
          )
          .join(""),
      );

      yield new WordDerivation({
        words: descriptions.map((word) => word.replaceAll(/[^A-Z]/g, "")),
        description: descriptions.join(" "),
        parents: [item],
      }).ifMatches(pattern);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(pattern.reverse())) {
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run()) {
      const valid = item.words.every((word) =>
        this.indices.every((idx) =>
          idx >= 0 ? word.length > idx : word.length >= -idx,
        ),
      );

      if (!valid) {
        continue;
      }

      const descriptions = item.words.map((word) =>
        Array.from(word)
          .map((letter, i) =>
            this.indices.includes(i) || this.indices.includes(i - word.length)
              ? letter
              : "_",
          )
          .join("")
          .replaceAll(/__+/g, "_"),
      );

      yield new WordDerivation({
        words: descriptions.map((word) => word.replaceAll(/[^A-Z]/g, "")),
        description: descriptions.join(" "),
        parents: [item],
      }).ifMatches(pattern);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(
      this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
    )) {
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

class Suffix extends Wordset {
  private parent: Wordset;

  constructor(parent: Wordset) {
    super();
    this.parent = parent;
  }

  _length(): Interval {
    return Interval.of(1, Math.max(1, this.parent.length.max - 1));
  }

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(
      this.parent.length.meet(Interval.of(pattern.length.min, Infinity)),
    )) {
      for (const i of interval(1, item.joined.length - 1)) {
        yield new WordDerivation({
          description: item.mapString((letter, j) => [
            j === i ? "_" : "",
            j >= i ? letter : "",
          ]),
          parents: [item],
        }).ifMatches(pattern);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    const map = new Map<string, WordDerivation>();

    for await (const item of this.right.run(pattern)) {
      if (!map.has(item.joined)) {
        map.set(item.joined, item);
      }
    }

    if (map.size === 0) {
      return;
    }

    for await (const item of this.left.run(pattern)) {
      const other = map.get(item.joined);
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.left.run(pattern)) {
      yield item;
    }
    for await (const item of this.right.run(pattern)) {
      yield item;
    }
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

  async *_run(pattern: Pattern): AsyncIterable<WordDerivation | null> {
    for await (const item of this.parent.run(pattern)) {
      if (Wordset.cromulence.cromulence(item.joined) >= 0) {
        yield item;
      }
    }
  }
}
