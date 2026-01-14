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
 * const wordplay = tadConfused.contains(returningProfit);
 * const results = definition.intersect(wordplay).match(/.{6}/);
 */
export class Wordset {
  items: Iterable<WordDerivation>;

  constructor(items: Iterable<WordDerivation>) {
    this.items = items;
  }

  static literal(words: string): Wordset {
    return new Wordset([{ words: words, description: "literal", parents: [] }]);
  }

  static synonym(words: string[]): Wordset {
    // TODO
  }

  // wordplay

  /** All anagrams. */
  anagram(): Wordset {
    return new Wordset(
      Iter.flatMap(this.items, (item) => {
        const fodder = item.words.join("");
        return Iter.map(anagrams(fodder), (anagram) => ({
          words: [anagram],
          description: `${fodder}*`,
          children: [item],
        }));
      }),
    );
  }

  /** Concat this with other. */
  charades(other: Wordset): Wordset {
    return new Wordset(
      Iter.map(Iter.product(this.items, other.items), ([a, b]) => ({
        words: [...a.words, ...b.words],
        description: `${a.words.join("")}+${b.words.join("")}`,
        children: [a, b],
      })),
    );
  }

  /** Containment wordplay: insert other into this. */
  contains(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this.items, other.items), function* ([a, b]) {
        const container = a.words.join("");
        const content = b.words.join("");
        for (const i of interval(1, container.length - 1)) {
          yield {
            words: [container.slice(0, i) + content + container.slice(i)],
            description: `${container.slice(0, i)}(${content})${container.slice(i)}`,
            children: [a, b],
          };
        }
      }),
    );
  }

  /** All possible deletions of the other subsequence from this. */
  delete(other: Wordset): Wordset {
    return new Wordset(
      Iter.flatMap(Iter.product(this.items, other.items), function* ([a, b]) {
        // TODO: remove the subsequence b.words.join("") from a.words.join("")
      }),
    );
  }

  ends(): Wordset {}

  homophone(): Wordset {
    // TODO
  }

  remove(indices: number[]): Wordset {}

  reverse(): Wordset {}

  select(indices: number[]): Wordset {}

  substring(): Wordset {}

  // not cryptic-y

  intersect(other: Wordset): Wordset {}

  match(regex: RegExp): Wordset {}
}
