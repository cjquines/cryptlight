export function interval(start: number, end: number, step = 1): number[] {
  const result = [];
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * The distinct rearrangements of word, lazily, starting with word itself.
 *
 * `allows(index, letter)` prunes the search: a rearrangement is only produced
 * if every letter is allowed at its index.
 */
export function* anagrams(
  word: string,
  allows: (index: number, letter: string) => boolean = () => true,
): Generator<string> {
  // Distinct letters in order of first appearance, so word comes first.
  const counts = new Map<string, number>();
  for (const letter of word) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  const letters = Array.from(counts.keys());
  const n = Array.from(word).length;
  const prefix: string[] = [];

  function* recurse(): Generator<string> {
    if (prefix.length === n) {
      yield prefix.join("");
      return;
    }
    for (const letter of letters) {
      const count = counts.get(letter)!;
      if (count === 0 || !allows(prefix.length, letter)) {
        continue;
      }
      counts.set(letter, count - 1);
      prefix.push(letter);
      yield* recurse();
      prefix.pop();
      counts.set(letter, count);
    }
  }

  yield* recurse();
}

/**
 * All occurrences of sub as a subsequence of word, returned as indices of
 * their characters.
 */
export function* subsequences(
  word: string,
  sub: string,
): Generator<Set<number>> {
  if (sub.length === 0 || sub.length > word.length) {
    return;
  }

  function* recurse(
    i: number,
    j: number,
    indices: number[] = [],
  ): Generator<Set<number>> {
    if (j === sub.length) {
      yield new Set(indices);
      return;
    }

    if (i === word.length) {
      return;
    }

    if (word[i] === sub[j]) {
      yield* recurse(i + 1, j + 1, [...indices, i]);
    }

    yield* recurse(i + 1, j, indices);
  }

  yield* recurse(0, 0);
}

/** An *inclusive* interval of integers. */
export class Interval {
  min: number;
  max: number;

  private constructor(min: number, max: number) {
    this.min = min;
    this.max = max;
  }

  static of(min: number, max = min): Interval {
    return new Interval(min, max);
  }

  static get positive(): Interval {
    return new Interval(1, Infinity);
  }

  static get nonnegative(): Interval {
    return new Interval(0, Infinity);
  }

  static get any(): Interval {
    return new Interval(-Infinity, Infinity);
  }

  static get empty(): Interval {
    return new Interval(Infinity, -Infinity);
  }

  [Symbol.iterator](): Iterator<number> {
    let index = this.min;

    return {
      next: () => {
        if (index <= this.max) {
          return { value: index++, done: false };
        } else {
          return { value: undefined, done: true };
        }
      },
    };
  }

  /** The number of integers in `this`. */
  get length(): number {
    return Math.max(0, this.max - this.min + 1);
  }

  isEmpty(): boolean {
    return this.min > this.max;
  }

  equals(other: Interval): boolean {
    return this.min === other.min && this.max === other.max;
  }

  /** Possible results of `this + other`. */
  add(other: Interval): Interval {
    return new Interval(this.min + other.min, this.max + other.max);
  }

  /** Possible results of `sum(intervals)`. */
  static sum(intervals: Iterable<Interval>): Interval {
    let result = Interval.of(0);
    for (const interval of intervals) {
      result = result.add(interval);
    }
    return result;
  }

  /** Possible results of `this - other`. */
  sub(other: Interval): Interval {
    return new Interval(this.min - other.max, this.max - other.min);
  }

  /** Numbers in both `this` and `other`. */
  meet(other: Interval): Interval {
    return new Interval(
      Math.max(this.min, other.min),
      Math.min(this.max, other.max),
    );
  }

  /** Numbers in all `intervals`. */
  static meet(intervals: Iterable<Interval>): Interval {
    let result = Interval.any;
    for (const interval of intervals) {
      result = result.meet(interval);
    }
    return result;
  }

  /** Numbers in either `this` or `other`. */
  join(other: Interval): Interval {
    return new Interval(
      Math.min(this.min, other.min),
      Math.max(this.max, other.max),
    );
  }

  /** Numbers in any `intervals`. */
  static join(intervals: Iterable<Interval>): Interval {
    let result = Interval.empty;
    for (const interval of intervals) {
      result = result.join(interval);
    }
    return result;
  }
}
