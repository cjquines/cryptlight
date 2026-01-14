import type { Cromulence } from "cromulence";
import { slugify } from "cromulence";
import * as Iter from "./iterable.js";
import { anagrams, interval } from "./util.js";

/** A string of "words" and how they were produced. */
type WordDerivation = {
  /**
   * The string itself. An array of uppercase-letter-only slugs, interpreted
   * as a space-separated string.
   *
   * Most transformations don't care about spacing, but a few do. (Consider
   * "the heads of...", which selects the first letters of each word.) So we
   * maintain an array to preserve spacing when needed.
   */
  words: string[];
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
};

/**
 * A set of "words". Wordsets are an abstraction for doing transformations over
 * multiple possibilities at once, which we can intersect and filter as needed.
 *
 * For example, the solution to the cryptic clue "Escort is tad confused about
 * returning profit (6)" can be found by:
 *
 * const definition = Wordset.synonym("Escort");
 * const tadConfused = Wordset.literal("tad").anagram();
 * const returningProfit = Wordset.synonym("profit").reverse();
 * const wordplay = tadConfused.insert(returningProfit);
 * const results = definition.intersect(wordplay).match(/.{6}/);
 */
export class Wordset {
  // TODO: inject this
  static cromulence: Cromulence;

  items: Iterable<WordDerivation>;

  constructor(items: Iterable<WordDerivation>) {
    this.items = items;
  }

  static literal(words: string): Wordset {
    const slugs = words
      .split(" ")
      .map((word) => slugify(word).toUpperCase())
      .filter((slug) => slug.length > 0);
    return new Wordset([
      {
        words: slugs,
        description: `literal "${words}"`,
        parents: [],
      },
    ]);
  }

  static synonym(words: string): Wordset {
    // TODO: implement for real
    return Wordset.literal(words);
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
      Iter.flatMap(this.items, (item) => {
        const fodder = item.words.join("");
        return Iter.map(anagrams(fodder), (anagram) => ({
          words: [anagram],
          description: `${fodder}*`,
          parents: [item],
        }));
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
      Iter.map(Iter.product(this.items, other.items), ([a, b]) => {
        return {
          words: [...a.words, ...b.words],
          description: `${a.words.join("")}+${b.words.join("")}`,
          parents: [a, b],
        };
      }),
    );
  }

  /**
   * Delete other from this: TH(-other)IS.
   *
   * This requires other to be a *subsequence* of this.
   */
  delete(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this.items, other.items), function* ([a, b]) {
        // TODO: remove the subsequence b.words.join("") from a.words.join("")
      }),
    );
  }

  /**
   * Delete all instances of other from this: TH(-other)IS.
   *
   * This requires other to be a *substring* of this.
   */
  deleteAll(other: Wordset): Wordset {}

  /**
   * Delete some middle substring of this: T(-hi)S.
   */
  ends(): Wordset {}

  /**
   * A homophone of this: "THIS".
   */
  homophone(): Wordset {
    // TODO: implement for real
    return new Wordset(this.items);
  }

  /**
   * Insert other into this: TH(OTHER)IS.
   *
   * This is called "containment" in cryptic clues.
   */
  insert(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this.items, other.items), function* ([a, b]) {
        const container = a.words.join("");
        const content = b.words.join("");
        for (const i of interval(1, container.length - 1)) {
          const prefix = container.slice(0, i);
          const suffix = container.slice(i);
          yield {
            words: [`${prefix}${content}${suffix}`],
            description: `${prefix}(${content})${suffix}`,
            parents: [a, b],
          };
        }
      }),
    );
  }

  /**
   * Prefix of this: TH_.
   *
   * Special case of substring.
   */
  prefix(): Wordset {}

  /**
   * Remove the specified indices from each word in this: TH(-i)S TH(-a)T.
   *
   * Indices can be negative, to handle indicators like "endless", which mean
   * removing the last letters.
   */
  remove(indices: number[]): Wordset {}

  /**
   * Reverse this: SIHT<.
   *
   * Technically a special case of anagrams. But unlike anagrams, it's usually
   * fine to reverse a wordset with more than one item.
   */
  reverse(): Wordset {}

  /**
   * Select the specified indices from each word in this: T_ T_.
   *
   * Indices can be negative, to handle indicators like "tails of", which mean
   * selecting the last letters.
   */
  select(indices: number[]): Wordset {}

  /**
   * Substring of this: _HI_.
   *
   * Because we use this for "hidden word" cryptic clues, we need to preserve
   * spacing: the substring of "bath island" is "_TH IS_", not "_THIS_".
   */
  substring(): Wordset {}

  /**
   * Suffix of this: _IS.
   *
   * Special case of substring.
   */
  suffix(): Wordset {}

  // non-cryptic-y transformations:

  /**
   * Intersect this and other: THIS = OTHER.
   *
   * We ignore spacing when intersecting.
   */
  intersect(other: Wordset): Wordset {}

  /**
   * Take only the words that match the given regex.
   *
   * A common special case is to take only matches of a given length.
   */
  match(regex: RegExp): Wordset {}

  /**
   * Take only the words that are "word-like".
   *
   * Specifically, we take the words that have a non-negative cromulence.
   */
  wordlike(): Wordset {}
}
