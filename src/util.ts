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
