import { Cromulence } from "cromulence";
import { slugify } from "cromulence";
import { datamuse } from "./datamuse.js";
import * as Iter from "./iterable.js";
import { anagrams, interval, subsequences } from "./util.js";

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
    parents,
  }: {
    words?: string[];
    description: string;
    parents: WordDerivation[];
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
}

export type WordsetData = {
  wordlist: Record<string, number>;
};

/**
 * A set of "words". Wordsets are an abstraction for doing transformations over
 * multiple possibilities at once, which we can intersect and filter as needed.
 *
 * For example, the solution to the cryptic clue "Escort is tad confused about
 * returning profit (6)" can be found by:
 *
 * const definition = await Wordset.synonym("Escort");
 * const tadConfused = Wordset.literal("tad").anagram();
 * const returningProfit = await Wordset.synonym("profit").reverse();
 * const wordplay = tadConfused.insert(returningProfit);
 * const results = definition.intersect(wordplay).match(/.{6}/);
 */
export class Wordset implements Iterable<WordDerivation> {
  static cromulence: Cromulence;

  private seen: WordDerivation[] = [];
  private iter: Iterator<WordDerivation>;

  constructor(items: Iterator<WordDerivation> | Iterable<WordDerivation>) {
    if (typeof items === "object" && "next" in items) {
      this.iter = items;
    } else {
      this.iter = items[Symbol.iterator]();
    }
  }

  static load(data: WordsetData): void {
    Wordset.cromulence = new Cromulence(data.wordlist);
  }

  [Symbol.iterator](): Iterator<WordDerivation> {
    let index = 0;

    return {
      next: () => {
        while (index >= this.seen.length) {
          const item = this.iter.next();
          if (item.done) {
            return { value: undefined, done: true };
          }
          this.seen.push(item.value);
        }
        return { value: this.seen[index++]!, done: false };
      },
    };
  }

  static literal(words: string): Wordset {
    const slugs = words
      .split(" ")
      .map((word) => slugify(word).toUpperCase())
      .filter((slug) => slug.length > 0);
    return new Wordset([
      new WordDerivation({
        words: slugs,
        description: `literal "${words}"`,
        parents: [],
      }),
    ]);
  }

  static async synonym(words: string): Promise<Wordset> {
    const results = await datamuse({ meansLike: words, maxResults: 1000 });
    return new Wordset(
      results.map((result) => {
        return new WordDerivation({
          words: [slugify(result.word).toUpperCase()],
          description: `synonym of "${words}"`,
          parents: [],
        });
      }),
    );
  }

  // cryptic-y transformations:

  /**
   * Anagrams: THIS*.
   *
   * It's *probably* a mistake to anagram a wordset with more than one item,
   * but we don't check that.
   */
  anagram(): Wordset {
    return new Wordset(
      Iter.flatMap(this, (item) => {
        return Iter.map(anagrams(item.joined), (anagram) => {
          return new WordDerivation({
            description: `${anagram}*`,
            parents: [item],
          });
        });
      }),
    );
  }

  /**
   * Concat this with other: THIS+OTHER.
   *
   * This is called "charades" in cryptic clues. They're not quite the same,
   * though, because this preserve spacing.
   */
  concat(other: Wordset): Wordset {
    return new Wordset(
      Iter.map(Iter.product(this, other), ([left, right]) => {
        return new WordDerivation({
          words: [...left.words, ...right.words],
          description: `${left}+${right}`,
          parents: [left, right],
        });
      }),
    );
  }

  /**
   * Delete the *subsequence* other from this: TH(-other)IS.
   *
   * Compare with deleteAll, which removes all instances at once.
   * Compare with remove, which takes indices, rather than letters.
   */
  delete(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this, other), function* ([whole, part]) {
        if (whole.joined.length <= part.joined.length) {
          return;
        }

        for (const indices of subsequences(whole.joined, part.joined)) {
          const description = whole.mapString((letter, i) => [
            indices.has(i) && !indices.has(i - 1) ? "(-" : "",
            indices.has(i) ? letter.toLowerCase() : letter,
            indices.has(i) && !indices.has(i + 1) ? ")" : "",
          ]);

          yield new WordDerivation({
            description,
            parents: [whole, part],
          });
        }
      }),
    );
  }

  /**
   * Delete all appearances of other from this: TH(-other)IS.
   *
   * Compare with delete, which removes a single subsequence.
   * Compare with remove, which takes indices, rather than letters.
   */
  deleteAll(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this, other), function* ([whole, part]) {
        const splits = whole.joined.split(part.joined);
        if (splits.length === 1) {
          return;
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
        });
      }),
    );
  }

  /**
   * Delete some (strictly) middle substring of this: T(-hi)S.
   */
  ends(): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        for (const start of interval(1, item.joined.length - 2)) {
          for (const end of interval(start + 1, item.joined.length - 1)) {
            yield new WordDerivation({
              description: item.mapString((letter, i) => [
                i === start ? "(-" : "",
                start <= i && i < end ? letter.toLowerCase() : letter,
                i === end - 1 ? ")" : "",
              ]),
              parents: [item],
            });
          }
        }
      }),
    );
  }

  /**
   * A homophone of this: "THIS".
   */
  async homophone(): Promise<Wordset> {
    const promises = await Promise.all(
      Array.from(this).map(async (item) => {
        const phrase = item.words.join(" ");
        return {
          item,
          phrase,
          results: await datamuse({ soundsLike: phrase }),
        };
      }),
    );
    return new Wordset(
      Iter.flatMap(promises, ({ item, phrase, results }) =>
        results.map((result) => {
          const { word: homophone } = result;
          return new WordDerivation({
            description: `${homophone.toUpperCase()} "${phrase}"`,
            parents: [item],
          });
        }),
      ),
    );
  }

  /**
   * Insert other into this: TH(OTHER)IS.
   *
   * This is called "containment" in cryptic clues.
   */
  insert(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this, other), function* ([container, content]) {
        for (const i of interval(1, container.joined.length - 1)) {
          yield new WordDerivation({
            description: container.mapString((letter, j) => [
              j === i ? `(${content})` : "",
              letter,
            ]),
            parents: [container, content],
          });
        }
      }),
    );
  }

  /**
   * Prefix of this: TH_.
   *
   * Special case of substring.
   */
  prefix(): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        for (const i of interval(item.joined.length - 1, 1, -1)) {
          yield new WordDerivation({
            description: item.mapString((letter, j) => [
              j === i ? "_" : "",
              j < i ? letter : "",
            ]),
            parents: [item],
          });
        }
      }),
    );
  }

  /**
   * Remove the specified indices from each word in this: TH(-i)S TH(-a)T.
   *
   * Indices can be negative, to handle indicators like "endless", which mean
   * removing the last letters.
   */
  remove(indices: number[]): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        const valid = item.words.every((word) =>
          indices.every((idx) =>
            idx >= 0 ? word.length > idx : word.length >= -idx,
          ),
        );

        if (!valid) {
          return;
        }

        const descriptions = item.words.map((word) =>
          Array.from(word)
            .map((letter, i) =>
              indices.includes(i) || indices.includes(i - word.length)
                ? `(-${letter.toLowerCase()})`
                : letter,
            )
            .join(""),
        );

        yield new WordDerivation({
          words: descriptions.map((word) => word.replaceAll(/[^A-Z]/g, "")),
          description: descriptions.join(" "),
          parents: [item],
        });
      }),
    );
  }

  /**
   * Reverse this: SIHT<.
   *
   * Technically a special case of anagrams. But unlike anagrams, it's usually
   * fine to reverse a wordset with more than one item.
   */
  reverse(): Wordset {
    return new Wordset(
      Iter.map(this, (item) => {
        const reversed = Array.from(item.joined);
        return new WordDerivation({
          description: `${item.mapString(() => [reversed.pop()!])}<`,
          parents: [item],
        });
      }),
    );
  }

  /**
   * Select the specified indices from each word in this: _I_ _A_.
   *
   * Indices can be negative, to handle indicators like "tails of", which mean
   * selecting the last letters.
   */
  select(indices: number[]): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        const valid = item.words.every((word) =>
          indices.every((idx) =>
            idx >= 0 ? word.length > idx : word.length >= -idx,
          ),
        );

        if (!valid) {
          return;
        }

        const descriptions = item.words.map((word) =>
          Array.from(word)
            .map((letter, i) =>
              indices.includes(i) || indices.includes(i - word.length)
                ? `_${letter}_`
                : "",
            )
            .join("")
            .replaceAll(/__+/g, "_")
            .replaceAll(/(^_)|(_$)/g, ""),
        );

        yield new WordDerivation({
          words: descriptions.map((word) => word.replaceAll(/[^A-Z]/g, "")),
          description: descriptions.join(" "),
          parents: [item],
        });
      }),
    );
  }

  /**
   * Substring of this: _HI_.
   *
   * This is called "hidden word" in cryptic clues.
   */
  substring(): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
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
            });
          }
        }
      }),
    );
  }

  /**
   * Suffix of this: _IS.
   *
   * Special case of substring.
   */
  suffix(): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        for (const i of interval(1, item.joined.length - 1)) {
          yield new WordDerivation({
            description: item.mapString((letter, j) => [
              j === i ? `_` : "",
              j >= i ? letter : "",
            ]),
            parents: [item],
          });
        }
      }),
    );
  }

  // non-cryptic-y transformations:

  /**
   * Intersect this and other: THIS = OTHER.
   *
   * We ignore spacing when intersecting.
   */
  intersect(other: Wordset): Wordset {
    // TODO: optimize by chunking the wordsets, rather than wholesale
    // intersecting
    const map = new Map<string, WordDerivation>();

    for (const item of other) {
      if (!map.has(item.joined)) {
        map.set(item.joined, item);
      }
    }

    return new Wordset(
      Iter.flatMap(this, function* (item) {
        if (map.has(item.joined)) {
          const other = map.get(item.joined)!;
          yield new WordDerivation({
            words: item.words,
            description: `${item.description} = ${other.description}`,
            parents: [item, other],
          });
        }
      }),
    );
  }

  /**
   * Take only the words that match the given regex.
   *
   * A common special case is to take only matches of a given length.
   */
  match(regex: RegExp): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        if (regex.test(item.joined)) {
          yield item;
        }
      }),
    );
  }

  /**
   * Take only the words that are "word-like".
   *
   * Specifically, we take the words that have a non-negative cromulence.
   */
  wordlike(): Wordset {
    return new Wordset(
      Iter.flatMap(this, function* (item) {
        if (Wordset.cromulence.cromulence(item.joined) >= 0) {
          yield item;
        }
      }),
    );
  }
}
